"""Portfolio API routes — CRUD for portfolio management."""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from models.database import get_db
from models.portfolio import Portfolio
from services.auth_service import get_current_user
from services.portfolio_service import (
    ensure_default_portfolio,
    get_portfolios_for_account,
    get_portfolio_by_id,
    recalculate_portfolio,
    remove_strategy_from_portfolios,
)
from schemas.portfolio import (
    PortfolioCreate,
    PortfolioUpdate,
    PortfolioResponse,
    PortfolioListResponse,
)

router = APIRouter(prefix="/api/portfolios", tags=["Portfolios"])


@router.get("/", response_model=PortfolioListResponse)
def list_portfolios(
    trading_account_id: str,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """List all portfolios for a trading account."""
    portfolios = get_portfolios_for_account(db, trading_account_id)
    return PortfolioListResponse(portfolios=portfolios)


@router.post("/", response_model=PortfolioResponse)
def create_portfolio(
    req: PortfolioCreate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """Create a new custom portfolio."""
    portfolio = Portfolio(
        trading_account_id=req.trading_account_id,
        name=req.name,
        strategy_ids=req.strategy_ids,
        auto_include_new=False,
        is_default=False,
    )
    db.add(portfolio)
    db.commit()
    db.refresh(portfolio)

    if req.strategy_ids:
        recalculate_portfolio(db, portfolio)

    return portfolio


@router.put("/{portfolio_id}", response_model=PortfolioResponse)
def update_portfolio(
    portfolio_id: str,
    req: PortfolioUpdate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """Update a portfolio (rename, toggle strategies, update risk_config)."""
    portfolio = get_portfolio_by_id(db, portfolio_id)
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")

    needs_recalc = False

    if req.name is not None:
        portfolio.name = req.name

    if req.strategy_ids is not None:
        portfolio.strategy_ids = req.strategy_ids
        needs_recalc = True

    if req.risk_config is not None:
        portfolio.risk_config = req.risk_config

    db.commit()

    if needs_recalc:
        recalculate_portfolio(db, portfolio)

    db.refresh(portfolio)
    return portfolio


@router.delete("/{portfolio_id}")
def delete_portfolio(
    portfolio_id: str,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """Delete a portfolio (cannot delete the default Global portfolio)."""
    portfolio = get_portfolio_by_id(db, portfolio_id)
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    if portfolio.is_default:
        raise HTTPException(status_code=400, detail="Cannot delete the default Global portfolio")

    db.delete(portfolio)
    db.commit()
    return {"detail": "Portfolio deleted"}
