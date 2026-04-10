"""LiveTradesService — Single Source of Truth for BT ↔ Live separation.

All consumers (Bayes, Workspace, Risk Metrics) use this same function
to query live trades, ensuring consistent separation everywhere.

Rule: start_date is the temporal frontier.
  - Everything in equity_curve (uploaded file) = BT prior
  - Everything in RealTrade with close_time >= start_date = Live evidence
"""

import logging
from typing import Optional
from datetime import timezone
from sqlalchemy.orm import Session
from dateutil import parser as dateparser

from models.real_trade import RealTrade
from models.strategy import Strategy

logger = logging.getLogger("ironrisk")


class LiveTradesService:
    """Shared query logic for live trade separation."""

    @staticmethod
    def _apply_magic_filter(query, magic_number):
        """Apply magic number filter. Accepts int or list[int].
        magic=0 means global (no filter). Lists use IN clause for aliases."""
        if isinstance(magic_number, list):
            # Multi-magic (from Strategy.all_magic_numbers)
            non_zero = [m for m in magic_number if m != 0]
            if non_zero:
                query = query.filter(RealTrade.magic_number.in_(non_zero))
        elif magic_number != 0:
            query = query.filter(RealTrade.magic_number == magic_number)
        return query

    @staticmethod
    def get_live_trades(
        db: Session,
        account_id: str,
        magic_number,  # int or list[int]
        start_date: Optional[str] = None,
    ) -> list:
        """Return ONLY live trades (post start_date) for a strategy.
        
        Args:
            db: Database session
            account_id: Trading account ID
            magic_number: Strategy magic number(s). int or list[int]. 0 = global/manual.
            start_date: Temporal frontier string (last BT trade date)
        
        Returns:
            List of RealTrade objects sorted chronologically, filtered to
            only include trades after start_date.
        """
        query = db.query(RealTrade).filter(
            RealTrade.trading_account_id == account_id
        )

        query = LiveTradesService._apply_magic_filter(query, magic_number)

        # ALWAYS filter by start_date — this is the BT/Live frontier
        if start_date:
            try:
                start_dt = dateparser.parse(start_date)
                if start_dt and start_dt.tzinfo is None:
                    start_dt = start_dt.replace(tzinfo=timezone.utc)
                query = query.filter(RealTrade.close_time > start_dt)
            except Exception as e:
                logger.warning(f"Failed to parse start_date '{start_date}': {e}")
                return []
        else:
            # Without start_date we can't know where BT ends
            logger.debug(f"No start_date for account={account_id} magic={magic_number} — returning empty live trades")
            return []

        return query.order_by(RealTrade.close_time.asc()).all()

    @staticmethod
    def get_live_pnls(
        db: Session,
        account_id: str,
        magic_number,  # int or list[int]
        start_date: Optional[str] = None,
    ) -> list[float]:
        """Convenience: return just the PnL values from live trades."""
        trades = LiveTradesService.get_live_trades(db, account_id, magic_number, start_date)
        return [t.profit for t in trades]

    @staticmethod
    def get_all_trades_unfiltered(
        db: Session,
        account_id: str,
        magic_number,  # int or list[int]
    ) -> list:
        """Return ALL RealTrades (no date filter). Used for total count."""
        query = db.query(RealTrade).filter(
            RealTrade.trading_account_id == account_id
        )
        query = LiveTradesService._apply_magic_filter(query, magic_number)
        return query.order_by(RealTrade.close_time.asc()).all()

