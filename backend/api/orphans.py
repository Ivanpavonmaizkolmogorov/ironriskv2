"""Sandbox: Orphan Magics API — detects magic numbers in RealTrade that have no Strategy."""

from typing import List
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func, literal

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
    try:
        # 1. Get all distinct magic numbers from RealTrade for this account
        trade_magics_rows = (
            db.query(
                RealTrade.magic_number,
                func.count(RealTrade.id).label("trade_count"),
                func.sum(RealTrade.profit).label("total_pnl"),
                func.max(RealTrade.close_time).label("last_trade"),
                func.min(RealTrade.close_time).label("first_trade"),
                func.string_agg(RealTrade.symbol.distinct(), literal(', ')).label("symbols"),
            )
            .filter(RealTrade.trading_account_id == account_id)
            .group_by(RealTrade.magic_number)
            .all()
        )

        # 2. Get all configured strategy magic numbers (primary + aliases)
        strategies = db.query(Strategy).filter(
            Strategy.trading_account_id == account_id
        ).all()
        configured_magics = set()
        for s in strategies:
            if s.magic_number is not None:
                configured_magics.add(s.magic_number)
            for alias in (s.magic_aliases or []):
                configured_magics.add(int(alias))

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
                "symbols": row.symbols or "",
                "first_seen": row.first_trade.isoformat() if row.first_trade else None,
                "last_seen": row.last_trade.isoformat() if row.last_trade else None,
            })

        return orphans
    except Exception:
        # Return empty list on any DB error (e.g. missing columns)
        return []


@router.delete("/{orphan_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_orphan(orphan_id: int, db: Session = Depends(get_db)):
    """Dismiss an orphan magic (from the persisted table)."""
    success = OrphanService.delete_orphan(db, orphan_id)
    if not success:
        raise HTTPException(status_code=404, detail="Orphan not found")
    return None


@router.get("/{account_id}/trades/{magic_number}", status_code=status.HTTP_200_OK)
def get_orphan_trades(account_id: str, magic_number: int, db: Session = Depends(get_db)):
    """Return all RealTrades for a specific magic number.
    Used in the wizard to give traders context about what bot they're configuring.
    Note: DEAL_COMMENT is not yet synced by the EA — future v60+ will include it."""
    trades = (
        db.query(RealTrade)
        .filter(
            RealTrade.trading_account_id == account_id,
            RealTrade.magic_number == magic_number,
        )
        .order_by(RealTrade.close_time.desc())
        .all()
    )

    return [
        {
            "ticket": t.ticket,
            "symbol": t.symbol or "—",
            "volume": t.volume or 0,
            "profit": round(t.profit, 2),
            "comment": t.comment or "",
            "close_time": t.close_time.strftime("%Y.%m.%d %H:%M") if t.close_time else None,
        }
        for t in trades
    ]


@router.post("/{account_id}/link/{magic_number}/{strategy_id}", status_code=status.HTTP_200_OK)
def link_orphan_to_strategy(
    account_id: str,
    magic_number: int,
    strategy_id: str,
    db: Session = Depends(get_db),
):
    """Link an orphan magic number to an existing strategy as an alias.
    
    The orphan's magic_number is added to the strategy's magic_aliases,
    so all its trades are aggregated into the same Bayesian evidence chain.
    """
    strategy = db.query(Strategy).filter(
        Strategy.id == strategy_id,
        Strategy.trading_account_id == account_id,
    ).first()
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")

    # Add alias (avoid duplicates)
    aliases = list(strategy.magic_aliases or [])
    if magic_number not in aliases and magic_number != strategy.magic_number:
        aliases.append(magic_number)
        strategy.magic_aliases = aliases
        
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(strategy, "magic_aliases")
        
        db.commit()
        db.refresh(strategy)

    return {
        "strategy_id": strategy.id,
        "strategy_name": strategy.name,
        "magic_number": strategy.magic_number,
        "magic_aliases": strategy.magic_aliases,
    }
