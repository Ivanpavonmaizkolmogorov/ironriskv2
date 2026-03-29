"""Pydantic schemas for live EA communication."""

from pydantic import BaseModel
from typing import List, Optional


class HeartbeatRequest(BaseModel):
    """Payload from the EA on each heartbeat."""
    api_token: str
    magic_number: int
    current_pnl: float
    current_drawdown: float = 0.0
    open_trades: int = 0
    consecutive_losses: int = 0
    stagnation_days: int = 0
    stagnation_trades: int = 0
    floating_by_magic: Optional[dict[str, float]] = None  # v46: per-magic floating PnL


class MetricStatus(BaseModel):
    name: str
    value: float
    zone: str
    percentile: float
    threshold_warning: float
    threshold_critical: float


class HeartbeatResponse(BaseModel):
    """Response to the EA with risk status."""
    status: str  # "NORMAL" | "WARNING" | "CRITICAL"
    metrics: List[MetricStatus]
    floor_level: float
    ceiling_level: float
    max_drawdown_limit: float = 0.0
    daily_loss_limit: float = 0.0
    risk_config: Optional[dict] = None
    risk_context: Optional[dict] = None
    portfolio_equity: Optional[float] = None


class SyncTradeRequest(BaseModel):
    """A single closed trade sent by the EA."""
    ticket: int
    magic_number: int
    symbol: str
    volume: float
    profit: float
    close_time: int  # MT5 time is Unix timestamp


class SyncTradesPayload(BaseModel):
    """Payload to batch-sync recently closed trades."""
    api_token: str
    trades: List[SyncTradeRequest]
