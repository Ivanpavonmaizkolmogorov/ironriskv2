"""
VS Mode — OOP Trade Matching Engine & Comparison Service.

Architecture:
- TradeMatchResult:  dataclass for a single matched trade pair + computed deltas
- VsComparisonResult: full comparison output (summary, matched, orphans, stats)
- TradeMatchingEngine: stateless engine that pairs trades by symbol+direction+open_time
- VsComparisonService: orchestrator that loads data and delegates to the engine
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session

from models.strategy import Strategy
from models.strategy_link import StrategyLink
from models.real_trade import RealTrade
from models.trading_account import TradingAccount

logger = logging.getLogger("ironrisk.vs")


# ═══════════════════════════════════════════════════════════════
#  DATA CLASSES
# ═══════════════════════════════════════════════════════════════

@dataclass
class TradeSummary:
    """Lightweight trade representation for the VS comparison."""
    ticket: int
    symbol: str
    deal_type: str          # "Buy" or "Sell"
    volume: float
    open_time: Optional[datetime]
    close_time: datetime
    open_price: Optional[float]
    close_price: Optional[float]
    profit: float
    
    @classmethod
    def from_real_trade(cls, trade: RealTrade) -> "TradeSummary":
        return cls(
            ticket=trade.ticket,
            symbol=trade.symbol or "",
            deal_type=trade.deal_type or "",
            volume=trade.volume or 0.0,
            open_time=trade.open_time,
            close_time=trade.close_time,
            open_price=trade.open_price,
            close_price=trade.close_price,
            profit=trade.profit,
        )


@dataclass
class TradeMatchResult:
    """A single matched pair with computed divergence deltas."""
    trade_a: TradeSummary
    trade_b: TradeSummary
    
    # Computed deltas
    entry_price_delta: float = 0.0       # B.open - A.open
    exit_price_delta: float = 0.0        # B.close - A.close
    pnl_delta: float = 0.0              # B.profit - A.profit
    timing_delta_seconds: float = 0.0    # seconds between open_times
    
    def __post_init__(self):
        if self.trade_a.open_price and self.trade_b.open_price:
            self.entry_price_delta = self.trade_b.open_price - self.trade_a.open_price
        if self.trade_a.close_price and self.trade_b.close_price:
            self.exit_price_delta = self.trade_b.close_price - self.trade_a.close_price
        self.pnl_delta = self.trade_b.profit - self.trade_a.profit
        if self.trade_a.open_time and self.trade_b.open_time:
            delta = (self.trade_b.open_time - self.trade_a.open_time).total_seconds()
            self.timing_delta_seconds = delta


@dataclass 
class DivergenceStats:
    """Aggregate divergence statistics."""
    total_trades_a: int = 0
    total_trades_b: int = 0
    matched_count: int = 0
    orphan_count_a: int = 0
    orphan_count_b: int = 0
    match_rate: float = 0.0              # percentage
    avg_entry_slippage: float = 0.0      # average entry price delta
    avg_exit_slippage: float = 0.0       # average exit price delta
    avg_pnl_delta: float = 0.0           # average P&L difference per trade
    total_pnl_delta: float = 0.0         # cumulative P&L difference
    avg_timing_delta_seconds: float = 0.0
    
    def to_dict(self) -> dict:
        return {
            "total_trades_a": self.total_trades_a,
            "total_trades_b": self.total_trades_b,
            "matched_count": self.matched_count,
            "orphan_count_a": self.orphan_count_a,
            "orphan_count_b": self.orphan_count_b,
            "match_rate": round(self.match_rate, 1),
            "avg_entry_slippage": round(self.avg_entry_slippage, 5),
            "avg_exit_slippage": round(self.avg_exit_slippage, 5),
            "avg_pnl_delta": round(self.avg_pnl_delta, 2),
            "total_pnl_delta": round(self.total_pnl_delta, 2),
            "avg_timing_delta_seconds": round(self.avg_timing_delta_seconds, 1),
        }


@dataclass
class StrategySummary:
    """Summary metrics for one side of the comparison."""
    strategy_id: str
    name: str
    workspace_name: str
    broker: str
    total_trades: int
    net_profit: float
    win_rate: float
    max_drawdown: float
    first_trade_date: Optional[str] = None  # ISO date of first trade
    
    def to_dict(self) -> dict:
        return {
            "strategy_id": self.strategy_id,
            "name": self.name,
            "workspace_name": self.workspace_name,
            "broker": self.broker or "",
            "total_trades": self.total_trades,
            "net_profit": round(self.net_profit, 2),
            "win_rate": round(self.win_rate, 1),
            "max_drawdown": round(self.max_drawdown, 2),
            "first_trade_date": self.first_trade_date,
        }


@dataclass
class VsComparisonResult:
    """Full VS comparison output."""
    summary_a: StrategySummary
    summary_b: StrategySummary
    divergence_stats: DivergenceStats
    matched_trades: list[TradeMatchResult] = field(default_factory=list)
    orphan_trades_a: list[TradeSummary] = field(default_factory=list)
    orphan_trades_b: list[TradeSummary] = field(default_factory=list)
    match_window_seconds: float = 60.0
    from_date: Optional[str] = None  # active filter, if any
    
    def to_dict(self) -> dict:
        return {
            "summary_a": self.summary_a.to_dict(),
            "summary_b": self.summary_b.to_dict(),
            "divergence_stats": self.divergence_stats.to_dict(),
            "matched_trades": [
                {
                    "trade_a": _trade_dict(m.trade_a),
                    "trade_b": _trade_dict(m.trade_b),
                    "entry_price_delta": round(m.entry_price_delta, 5),
                    "exit_price_delta": round(m.exit_price_delta, 5),
                    "pnl_delta": round(m.pnl_delta, 2),
                    "timing_delta_seconds": round(m.timing_delta_seconds, 1),
                }
                for m in self.matched_trades
            ],
            "orphan_trades_a": [_trade_dict(t) for t in self.orphan_trades_a],
            "orphan_trades_b": [_trade_dict(t) for t in self.orphan_trades_b],
            "match_window_seconds": self.match_window_seconds,
            "from_date": self.from_date,
        }


def _trade_dict(t: TradeSummary) -> dict:
    return {
        "ticket": t.ticket,
        "symbol": t.symbol,
        "deal_type": t.deal_type,
        "volume": t.volume,
        "open_time": t.open_time.isoformat() if t.open_time else None,
        "close_time": t.close_time.isoformat() if t.close_time else None,
        "open_price": t.open_price,
        "close_price": t.close_price,
        "profit": round(t.profit, 2),
    }


# ═══════════════════════════════════════════════════════════════
#  TRADE MATCHING ENGINE (stateless, pure logic)
# ═══════════════════════════════════════════════════════════════

class TradeMatchingEngine:
    """
    Pairs trades between two sets by symbol, direction, and open_time proximity.
    
    Algorithm:
    1. Normalize symbols (strip broker suffixes like .pro, .m, .ecn)
    2. Group trades_b by (normalized_symbol, deal_type) for O(1) lookup
    3. For each trade in trades_a, find the closest match in trades_b
       within the time window
    4. A trade_b can only be matched to ONE trade_a (consumed on match)
    5. Unmatched trades become orphans
    """
    
    # Common broker suffixes to strip for cross-broker matching
    # Sorted longest-first at match time to prefer '.micro' over '.m'
    BROKER_SUFFIXES = [
        # Dot-separated (most common)
        '.pro', '.ecn', '.raw', '.std', '.micro', '.mini',
        '.i', '.e', '.z', '.c', '.b', '.s', '.x', '.m',
        # Underscore-separated
        '_m', '_i', '_sb',
        # Bare suffixes (without separator) — only single chars commonly used
        'm', 'c', 'i', 'e',
    ]
    
    def __init__(self, window_seconds: float = 60.0):
        self.window = timedelta(seconds=window_seconds)
    
    @staticmethod
    def _normalize_symbol(symbol: str) -> str:
        """Strip broker-specific suffixes from symbol for cross-broker matching.
        
        Examples:
            USDJPY.pro  -> USDJPY
            EURUSDm     -> EURUSD (only if suffix matches known list)
            XAUUSD.ecn  -> XAUUSD
            BTCUSD      -> BTCUSD (no change)
        """
        s = symbol.strip()
        s_lower = s.lower()
        # Try to strip known suffixes (longest first for greedy match)
        for suffix in sorted(TradeMatchingEngine.BROKER_SUFFIXES, key=len, reverse=True):
            if s_lower.endswith(suffix):
                s = s[:len(s) - len(suffix)]
                break
        return s.upper()
    
    def match(
        self,
        trades_a: list[TradeSummary],
        trades_b: list[TradeSummary],
    ) -> tuple[list[TradeMatchResult], list[TradeSummary], list[TradeSummary]]:
        """
        Returns:
            (matched_pairs, orphans_a, orphans_b)
        """
        # Build lookup: (normalized_symbol, deal_type) -> sorted list of trades
        b_pool: dict[tuple[str, str], list[TradeSummary]] = {}
        for tb in trades_b:
            key = (self._normalize_symbol(tb.symbol), tb.deal_type.upper())
            b_pool.setdefault(key, []).append(tb)
        
        # Sort each group by open_time for efficient nearest-match
        for group in b_pool.values():
            group.sort(key=lambda t: t.open_time or datetime.min)
        
        matched: list[TradeMatchResult] = []
        orphans_a: list[TradeSummary] = []
        consumed_b: set[int] = set()  # track by ticket to avoid double-match
        
        for ta in trades_a:
            if not ta.open_time:
                orphans_a.append(ta)
                continue
            
            key = (self._normalize_symbol(ta.symbol), ta.deal_type.upper())
            candidates = b_pool.get(key, [])
            
            best_match: Optional[TradeSummary] = None
            best_delta = float("inf")
            
            for tb in candidates:
                if tb.ticket in consumed_b:
                    continue
                if not tb.open_time:
                    continue
                
                delta = abs((tb.open_time - ta.open_time).total_seconds())
                if delta <= self.window.total_seconds() and delta < best_delta:
                    best_delta = delta
                    best_match = tb
            
            if best_match:
                consumed_b.add(best_match.ticket)
                matched.append(TradeMatchResult(trade_a=ta, trade_b=best_match))
            else:
                orphans_a.append(ta)
        
        # Remaining unmatched trades_b
        orphans_b = [tb for tb in trades_b if tb.ticket not in consumed_b]
        
        return matched, orphans_a, orphans_b
    
    def compute_stats(
        self,
        trades_a: list[TradeSummary],
        trades_b: list[TradeSummary],
        matched: list[TradeMatchResult],
        orphans_a: list[TradeSummary],
        orphans_b: list[TradeSummary],
    ) -> DivergenceStats:
        """Compute aggregate divergence statistics from match results."""
        stats = DivergenceStats(
            total_trades_a=len(trades_a),
            total_trades_b=len(trades_b),
            matched_count=len(matched),
            orphan_count_a=len(orphans_a),
            orphan_count_b=len(orphans_b),
        )
        
        total = max(len(trades_a), len(trades_b))
        stats.match_rate = (len(matched) / total * 100) if total > 0 else 0.0
        
        if matched:
            stats.avg_entry_slippage = sum(m.entry_price_delta for m in matched) / len(matched)
            stats.avg_exit_slippage = sum(m.exit_price_delta for m in matched) / len(matched)
            stats.avg_pnl_delta = sum(m.pnl_delta for m in matched) / len(matched)
            stats.total_pnl_delta = sum(m.pnl_delta for m in matched)
            stats.avg_timing_delta_seconds = sum(m.timing_delta_seconds for m in matched) / len(matched)
        
        return stats


# ═══════════════════════════════════════════════════════════════
#  VS COMPARISON SERVICE (orchestrator, DB access)
# ═══════════════════════════════════════════════════════════════

class VsComparisonService:
    """
    High-level orchestrator for VS comparisons.
    
    Responsibilities:
    - Load trades from DB for both strategies
    - Delegate matching to TradeMatchingEngine
    - Build StrategySummary for each side
    - Return VsComparisonResult
    """
    
    def __init__(self, db: Session):
        self.db = db
    
    def compare(
        self,
        strategy_a: Strategy,
        strategy_b: Strategy,
        window_seconds: float = 60.0,
        from_date: Optional[datetime] = None,
    ) -> VsComparisonResult:
        """Run a full VS comparison between two strategies.
        
        Args:
            from_date: Optional datetime to filter trades from this date onwards.
        """
        
        # Load trades (optionally filtered by from_date)
        trades_a_raw = self._load_trades(strategy_a, from_date=from_date)
        trades_b_raw = self._load_trades(strategy_b, from_date=from_date)
        
        trades_a = [TradeSummary.from_real_trade(t) for t in trades_a_raw]
        trades_b = [TradeSummary.from_real_trade(t) for t in trades_b_raw]
        
        # Match
        engine = TradeMatchingEngine(window_seconds=window_seconds)
        matched, orphans_a, orphans_b = engine.match(trades_a, trades_b)
        stats = engine.compute_stats(trades_a, trades_b, matched, orphans_a, orphans_b)
        
        # Build summaries (from filtered trades, but get first_trade_date from ALL trades)
        summary_a = self._build_summary(strategy_a, trades_a_raw)
        summary_b = self._build_summary(strategy_b, trades_b_raw)
        
        # Get global first trade dates (unfiltered) for the date filter buttons
        first_a = self._get_first_trade_date(strategy_a)
        first_b = self._get_first_trade_date(strategy_b)
        summary_a.first_trade_date = first_a.isoformat() if first_a else None
        summary_b.first_trade_date = first_b.isoformat() if first_b else None
        
        return VsComparisonResult(
            summary_a=summary_a,
            summary_b=summary_b,
            divergence_stats=stats,
            matched_trades=matched,
            orphan_trades_a=orphans_a,
            orphan_trades_b=orphans_b,
            match_window_seconds=window_seconds,
            from_date=from_date.isoformat() if from_date else None,
        )
    
    def _load_trades(self, strategy: Strategy, from_date: Optional[datetime] = None) -> list[RealTrade]:
        """Load trades for a strategy, optionally filtered by from_date."""
        magics = strategy.all_magic_numbers
        query = (
            self.db.query(RealTrade)
            .filter(
                RealTrade.trading_account_id == strategy.trading_account_id,
                RealTrade.magic_number.in_(magics),
                RealTrade.open_time.isnot(None),
            )
        )
        if from_date:
            query = query.filter(RealTrade.open_time >= from_date)
        return query.order_by(RealTrade.open_time).all()
    
    def _get_first_trade_date(self, strategy: Strategy) -> Optional[datetime]:
        """Get the date of the first trade for a strategy (unfiltered)."""
        magics = strategy.all_magic_numbers
        first = (
            self.db.query(RealTrade.open_time)
            .filter(
                RealTrade.trading_account_id == strategy.trading_account_id,
                RealTrade.magic_number.in_(magics),
                RealTrade.open_time.isnot(None),
            )
            .order_by(RealTrade.open_time)
            .first()
        )
        return first[0] if first else None
    
    def _build_summary(self, strategy: Strategy, trades: list[RealTrade]) -> StrategySummary:
        """Build a summary from strategy model + live trades."""
        account = self.db.query(TradingAccount).filter(
            TradingAccount.id == strategy.trading_account_id
        ).first()
        
        wins = sum(1 for t in trades if t.profit > 0)
        total = len(trades)
        net = sum(t.profit for t in trades)
        
        # Get max drawdown from metrics_snapshot if available
        max_dd = 0.0
        if strategy.metrics_snapshot:
            dd_data = strategy.metrics_snapshot.get("max_drawdown", {})
            max_dd = dd_data.get("max_max_drawdown", 0.0)
        
        return StrategySummary(
            strategy_id=strategy.id,
            name=strategy.name,
            workspace_name=account.name if account else "Unknown",
            broker=account.broker if account else "",
            total_trades=total,
            net_profit=net,
            win_rate=(wins / total * 100) if total > 0 else 0.0,
            max_drawdown=max_dd,
        )
