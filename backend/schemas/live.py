"""Pydantic schemas for live EA communication."""

from pydantic import BaseModel
from typing import List, Optional


class HeartbeatRequest(BaseModel):
    """Payload from the EA on each heartbeat."""
    api_token: str
    account_number: Optional[str] = None
    magic_number: int
    current_pnl: float
    current_drawdown: float = 0.0
    open_trades: int = 0
    consecutive_losses: int = 0
    stagnation_days: int = 0
    stagnation_trades: int = 0
    floating_by_magic: Optional[dict[str, float]] = None  # v46: per-magic floating PnL
    hostname: Optional[str] = None  # VPS/Computer name injected by installer
    language: str = "es"


class MetricStatus(BaseModel):
    name: str
    value: float
    zone: str
    percentile: float
    threshold_warning: float
    threshold_critical: float


class HeartbeatResponse(BaseModel):
    """Response to the EA with risk status."""
    status: str  # "NORMAL" | "WARNING" | "CRITICAL" | "KILL"
    metrics: List[MetricStatus]
    floor_level: float
    ceiling_level: float
    max_drawdown_limit: float = 0.0
    daily_loss_limit: float = 0.0
    risk_config: Optional[dict] = None
    risk_context: Optional[dict] = None
    portfolio_equity: Optional[float] = None
    kill: bool = False
    kill_reason: Optional[str] = None

    # --- Server-Driven UI (Ulysses Pact) ---
    master_verdict: Optional[str] = "GREEN"  # GREEN, AMBER, RED
    verdict_reasons: str = ""
    pact_broken: bool = False
    ulysses_banner: Optional[dict] = None  # { text: str, bg_color: str, font_color: str }
    trade_instruction: Optional[str] = "RESUME" # RESUME, REDUCE_RISK, HALT_TRADING



class SyncTradeRequest(BaseModel):
    """A single closed trade sent by the EA."""
    ticket: int
    magic_number: int
    symbol: str
    volume: float
    profit: float
    comment: Optional[str] = None
    close_time: int  # MT5 time is Unix timestamp
    
    # Advanced Data
    open_time: Optional[int] = None
    open_price: Optional[float] = None
    close_price: Optional[float] = None
    sl: Optional[float] = None
    tp: Optional[float] = None
    deal_type: Optional[str] = None
    commission: Optional[float] = None
    swap: Optional[float] = None


class SyncTradesPayload(BaseModel):
    """Payload to batch-sync recently closed trades."""
    api_token: str
    account_number: Optional[str] = None
    trades: List[SyncTradeRequest]
