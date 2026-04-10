"""Pydantic schemas for strategy requests/responses."""

from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


# --- Wizard Step Data ---

class StrategyStepOne(BaseModel):
    """Step 1: Basic info."""
    name: str
    description: str = ""
    magic_number: int = 0
    start_date: Optional[str] = None


class StrategyStepThree(BaseModel):
    """Step 3: Hard Stops (pain limits)."""
    max_drawdown_limit: float
    daily_loss_limit: float


class StrategyUpdate(BaseModel):
    """Payload for updating strategy parameters (from Step 1)."""
    name: Optional[str] = None
    description: Optional[str] = None
    magic_number: Optional[int] = None
    magic_aliases: Optional[List[int]] = None
    start_date: Optional[str] = None
    max_drawdown_limit: Optional[float] = None
    daily_loss_limit: Optional[float] = None
    risk_config: Optional[dict] = None
    dashboard_layout: Optional[dict] = None
    metrics_snapshot: Optional[dict] = None
    net_profit: Optional[float] = None
    total_trades: Optional[int] = None
    bt_discount: Optional[float] = None
    risk_multiplier: Optional[float] = None

class CreateStrategyRequest(BaseModel):
    """Full strategy creation payload (sent after wizard completion)."""
    trading_account_id: str
    name: str
    description: str = ""
    magic_number: int = 0
    start_date: Optional[str] = None
    max_drawdown_limit: float = 0.0
    daily_loss_limit: float = 0.0
    dashboard_layout: Optional[dict] = None
    risk_multiplier: Optional[float] = 1.0


class CreateFromSimulationRequest(BaseModel):
    """Create a strategy from simulator data — carries full backtest context."""
    trading_account_id: str
    name: str
    magic_number: int = 0
    risk_config: Optional[dict] = None
    decomposition: Optional[dict] = None
    risk_suggestions: Optional[dict] = None
    extracted_stats: Optional[dict] = None
    equity_curve: Optional[list] = None
    start_date: Optional[str] = None
    bt_discount: Optional[float] = None

# --- Responses ---

class MetricSnapshotResponse(BaseModel):
    """Per-metric stats from backtest analysis."""
    name: str
    max_value: float
    mean_value: float
    std_value: float
    percentile_90: float
    percentile_95: float


class LiveTradeResponse(BaseModel):
    """Represents a single trade execution for the Trade Log UI."""
    ticket: int
    magic_number: int
    symbol: Optional[str]
    volume: Optional[float]
    profit: float
    comment: Optional[str]
    close_time: datetime
    # Advanced Data
    open_time: Optional[datetime] = None
    open_price: Optional[float] = None
    close_price: Optional[float] = None
    sl: Optional[float] = None
    tp: Optional[float] = None
    deal_type: Optional[str] = None
    commission: Optional[float] = None
    swap: Optional[float] = None

    class Config:
        from_attributes = True


class StrategyResponse(BaseModel):
    """Strategy summary for dashboard list."""
    id: str
    trading_account_id: str
    name: str
    description: str
    magic_number: int
    magic_aliases: Optional[List[int]] = None
    start_date: Optional[str]
    max_drawdown_limit: float
    daily_loss_limit: float
    total_trades: int
    net_profit: float
    bt_discount: float = 10.0
    risk_multiplier: float = 1.0
    equity_curve: Optional[list] = None
    gauss_params: Optional[dict] = None
    metrics_snapshot: Optional[dict] = None
    risk_config: Optional[dict] = None
    dashboard_layout: Optional[dict] = None
    distribution_fit: Optional[dict] = None

    class Config:
        from_attributes = True


class StrategyListResponse(BaseModel):
    strategies: List[StrategyResponse]
