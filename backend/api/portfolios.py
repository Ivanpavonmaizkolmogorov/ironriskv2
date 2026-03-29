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


@router.get("/{portfolio_id}/chart/{metric_name}")
def get_portfolio_chart(
    portfolio_id: str,
    metric_name: str,
    value: float = None,
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Returns a BMP image plotting the portfolio's current value against its historical distribution."""
    from fastapi.responses import Response
    from services.stats.chart_renderer import render_metric_chart
    from services.stats.fit_result import FitResult
    
    portfolio = get_portfolio_by_id(db, portfolio_id)
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")
        
    if not getattr(portfolio, "distribution_fit", None):
        fit = FitResult.empty(metric_name)
    else:
        fit_dict = portfolio.distribution_fit.get(metric_name)
        if fit_dict and (fit_dict.get("passed") or fit_dict.get("distribution_name") == "empirical"):
            fit = FitResult.from_dict(fit_dict)
        else:
            fit = FitResult.empty(metric_name)
            
    bmp_bytes = render_metric_chart(fit, current_val=value, width=420, height=260)
    return Response(content=bmp_bytes, media_type="image/bmp")


@router.get("/{portfolio_id}/chart-data/{metric_name}")
def get_portfolio_chart_data(
    portfolio_id: str,
    metric_name: str,
    value: float = None,
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Returns raw JSON data arrays for the statistical distribution for a Portfolio."""
    from services.stats.fit_result import FitResult
    import numpy as np
    
    portfolio = get_portfolio_by_id(db, portfolio_id)
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")
        
    if not getattr(portfolio, "distribution_fit", None):
        fit = FitResult.empty(metric_name)
    else:
        fit_dict = portfolio.distribution_fit.get(metric_name)
        if fit_dict and (fit_dict.get("passed") or fit_dict.get("distribution_name") == "empirical"):
            fit = FitResult.from_dict(fit_dict)
        else:
            fit = FitResult.empty(metric_name)
            
    response_data = {
        "metric_name": metric_name,
        "distribution_name": fit.distribution_name,
        "passed": fit.passed,
        "parameters": fit.get_mapped_params(),
        "histogram": [],
        "curve": [],
        "current_value": value
    }

    if fit.empirical_percentiles:
        perc_vals = np.array(fit.empirical_percentiles)
        HIGHER_IS_WORSE = {"daily_loss", "max_drawdown", "consecutive_losses",
                           "stagnation_days", "stagnation_trades"}
        if fit.metric_name in HIGHER_IS_WORSE:
            perc_vals = np.maximum(0.0, perc_vals)
        
        data_range = perc_vals[-1] - perc_vals[0]
        if data_range > 0:
            n_bins = min(30, max(10, int(np.sqrt(len(perc_vals)))))
            hist, bin_edges = np.histogram(perc_vals, bins=n_bins, density=True)
            for i in range(len(hist)):
                response_data["histogram"].append({
                    "x0": float(bin_edges[i]),
                    "x1": float(bin_edges[i+1]),
                    "height": float(hist[i])
                })

    if fit.passed and fit.distribution_name not in ("empirical", "none"):
        start = fit.ppf(0.001)
        end = fit.ppf(0.999)
        span = end - start
        x = np.linspace(start - 0.05*span, end + 0.05*span, 300)
        y = fit.pdf(x)
        for val_x, val_y in zip(x, y):
            response_data["curve"].append({
                "x": float(val_x),
                "y": float(val_y)
            })

    return response_data
from pydantic import BaseModel

class RecalculateAllRequest(BaseModel):
    trading_account_id: str

@router.post("/recalculate-all")
def recalculate_all_auto_portfolios(
    req: RecalculateAllRequest,
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Force recalculation of all auto-include (Default) portfolios for an account after bulk operations."""
    portfolios = db.query(Portfolio).filter(
        Portfolio.trading_account_id == req.trading_account_id,
        Portfolio.auto_include_new == True,
    ).all()
    
    count = 0
    for p in portfolios:
        recalculate_portfolio(db, p)
        count += 1
        
    return {"detail": f"Recalculated {count} auto-include portfolios"}
