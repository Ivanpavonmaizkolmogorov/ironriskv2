"""VS Mode API — Strategy linking and cross-workspace comparison."""

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from models import get_db
from models.strategy import Strategy
from models.strategy_link import StrategyLink
from models.trading_account import TradingAccount
from services.auth_service import get_current_user
from services.vs_comparison_service import VsComparisonService

router = APIRouter(prefix="/api/vs", tags=["vs-mode"])


# ─── Request Schemas ─────────────────────────────────────────

class LinkRequest(BaseModel):
    linked_strategy_id: str
    match_window_seconds: float = 60.0


class UpdateWindowRequest(BaseModel):
    match_window_seconds: float


# ─── Link / Unlink ───────────────────────────────────────────

@router.post("/{strategy_id}/link")
def link_strategy(
    strategy_id: str,
    body: LinkRequest,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """Create a bidirectional link between two strategies."""
    # Validate both strategies exist and belong to the user
    strat_a = _get_user_strategy(db, strategy_id, user.id)
    strat_b = _get_user_strategy(db, body.linked_strategy_id, user.id)
    
    if strat_a.id == strat_b.id:
        raise HTTPException(400, "Cannot link a strategy to itself")
    
    # Check if already linked
    existing = db.query(StrategyLink).filter(
        StrategyLink.strategy_id == strat_a.id,
        StrategyLink.linked_strategy_id == strat_b.id,
    ).first()
    if existing:
        raise HTTPException(409, "These strategies are already linked")
    
    # Create bidirectional links
    link_ab = StrategyLink(
        strategy_id=strat_a.id,
        linked_strategy_id=strat_b.id,
        match_window_seconds=body.match_window_seconds,
    )
    link_ba = StrategyLink(
        strategy_id=strat_b.id,
        linked_strategy_id=strat_a.id,
        match_window_seconds=body.match_window_seconds,
    )
    db.add(link_ab)
    db.add(link_ba)
    db.commit()
    
    return {"status": "linked", "strategy_a": strat_a.id, "strategy_b": strat_b.id}


@router.delete("/{strategy_id}/link/{linked_strategy_id}")
def unlink_strategy(
    strategy_id: str,
    linked_strategy_id: str,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """Remove a bidirectional link between two strategies."""
    _get_user_strategy(db, strategy_id, user.id)
    
    # Delete both directions
    db.query(StrategyLink).filter(
        StrategyLink.strategy_id == strategy_id,
        StrategyLink.linked_strategy_id == linked_strategy_id,
    ).delete()
    db.query(StrategyLink).filter(
        StrategyLink.strategy_id == linked_strategy_id,
        StrategyLink.linked_strategy_id == strategy_id,
    ).delete()
    db.commit()
    
    return {"status": "unlinked"}


@router.patch("/{strategy_id}/link/{linked_strategy_id}/window")
def update_match_window(
    strategy_id: str,
    linked_strategy_id: str,
    body: UpdateWindowRequest,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """Update the match window for a specific link."""
    _get_user_strategy(db, strategy_id, user.id)
    
    # Update both directions
    db.query(StrategyLink).filter(
        StrategyLink.strategy_id == strategy_id,
        StrategyLink.linked_strategy_id == linked_strategy_id,
    ).update({"match_window_seconds": body.match_window_seconds})
    db.query(StrategyLink).filter(
        StrategyLink.strategy_id == linked_strategy_id,
        StrategyLink.linked_strategy_id == strategy_id,
    ).update({"match_window_seconds": body.match_window_seconds})
    db.commit()
    
    return {"status": "updated", "match_window_seconds": body.match_window_seconds}


# ─── Get Links ───────────────────────────────────────────────

@router.get("/{strategy_id}/links")
def get_strategy_links(
    strategy_id: str,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """Get all linked strategies for a given strategy."""
    _get_user_strategy(db, strategy_id, user.id)
    
    links = db.query(StrategyLink).filter(
        StrategyLink.strategy_id == strategy_id,
    ).all()
    
    result = []
    for link in links:
        linked = db.query(Strategy).filter(Strategy.id == link.linked_strategy_id).first()
        if not linked:
            continue
        account = db.query(TradingAccount).filter(
            TradingAccount.id == linked.trading_account_id
        ).first()
        result.append({
            "link_id": link.id,
            "strategy_id": linked.id,
            "strategy_name": linked.name,
            "workspace_name": account.name if account else "Unknown",
            "broker": account.broker if account else "",
            "account_number": account.account_number if account else "",
            "match_window_seconds": link.match_window_seconds,
            "created_at": link.created_at.isoformat() if link.created_at else None,
        })
    
    return result


# ─── VS Comparison ───────────────────────────────────────────

@router.get("/{strategy_id}/compare/{linked_strategy_id}")
def get_vs_comparison(
    strategy_id: str,
    linked_strategy_id: str,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """Run a full VS comparison between two linked strategies."""
    strat_a = _get_user_strategy(db, strategy_id, user.id)
    strat_b = _get_user_strategy(db, linked_strategy_id, user.id)
    
    # Get the match window from the link
    link = db.query(StrategyLink).filter(
        StrategyLink.strategy_id == strategy_id,
        StrategyLink.linked_strategy_id == linked_strategy_id,
    ).first()
    
    window = link.match_window_seconds if link else 60.0
    
    service = VsComparisonService(db)
    result = service.compare(strat_a, strat_b, window_seconds=window)
    
    return result.to_dict()


# ─── Cross-Workspace Strategy Listing ────────────────────────

@router.get("/strategies/cross-workspace")
def list_cross_workspace_strategies(
    exclude_account_id: str = None,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """
    List all strategies across all user's workspaces, 
    optionally excluding one account (the current workspace).
    Used for the "link" selector.
    """
    accounts = db.query(TradingAccount).filter(
        TradingAccount.user_id == user.id,
        TradingAccount.is_active == True,
    ).all()
    
    result = []
    for account in accounts:
        if exclude_account_id and account.id == exclude_account_id:
            continue
        
        strategies = db.query(Strategy).filter(
            Strategy.trading_account_id == account.id
        ).all()
        
        for s in strategies:
            result.append({
                "strategy_id": s.id,
                "strategy_name": s.name,
                "magic_number": s.magic_number,
                "workspace_id": account.id,
                "workspace_name": account.name,
                "broker": account.broker or "",
                "total_trades": s.total_trades,
            })
    
    return result


# ─── Helpers ─────────────────────────────────────────────────

def _get_user_strategy(db: Session, strategy_id: str, user_id: str) -> Strategy:
    """Validate the strategy exists and belongs to the user."""
    strategy = db.query(Strategy).filter(Strategy.id == strategy_id).first()
    if not strategy:
        raise HTTPException(404, "Strategy not found")
    
    account = db.query(TradingAccount).filter(
        TradingAccount.id == strategy.trading_account_id,
        TradingAccount.user_id == user_id,
    ).first()
    if not account:
        raise HTTPException(403, "Strategy does not belong to you")
    
    return strategy
