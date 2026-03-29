"""Sandbox: Orphan Magics API — detects magic numbers in RealTrade that have no Strategy."""

from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func

from models.database import get_db
from models.real_trade import RealTrade
from models.strategy import Strategy
from services.orphan_service import OrphanService

router = APIRouter()


@router.get("/{account_id}", status_code=status.HTTP_200_OK)
def get_orphans(account_id: str, db: Session = Depends(get_db)):
    """Detect orphan magics by scanning RealTrade history.
    
    An orphan is a magic_number that exists in RealTrade 
    but has no corresponding Strategy configured.
    """
    # 1. Get all distinct magic numbers from RealTrade for this account
    trade_magics_rows = (
        db.query(
            RealTrade.magic_number,
            func.count(RealTrade.id).label("trade_count"),
            func.sum(RealTrade.profit).label("total_pnl"),
            func.max(RealTrade.close_time).label("last_trade"),
            func.min(RealTrade.close_time).label("first_trade"),
        )
        .filter(RealTrade.trading_account_id == account_id)
        .group_by(RealTrade.magic_number)
        .all()
    )

    # 2. Get all configured strategy magic numbers
    configured_magics = set(
        s[0]
        for s in db.query(Strategy.magic_number)
        .filter(Strategy.trading_account_id == account_id)
        .all()
        if s[0] is not None
    )

    # 3. Find orphans: in trades but not in strategies (exclude magic 0 = manual)
    orphans = []
    for row in trade_magics_rows:
        magic = row.magic_number
        if magic == 0 or magic in configured_magics:
            continue
        orphans.append({
            "id": magic,  # Use magic as ID for frontend compatibility
            "account_id": account_id,
            "magic_number": magic,
            "trade_count": row.trade_count,
            "total_pnl": round(float(row.total_pnl or 0), 2),
            "current_pnl": round(float(row.total_pnl or 0), 2),
            "first_seen": row.first_trade.isoformat() if row.first_trade else None,
            "last_seen": row.last_trade.isoformat() if row.last_trade else None,
        })

    return orphans


@router.delete("/{orphan_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_orphan(orphan_id: int, db: Session = Depends(get_db)):
    """Dismiss an orphan magic (from the persisted table)."""
    success = OrphanService.delete_orphan(db, orphan_id)
    if not success:
        raise HTTPException(status_code=404, detail="Orphan not found")
    return None
