"""Pydantic schemas for strategy requests/responses."""

from pydantic import BaseModel
from typing import Optional, List


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


class CreateStrategyRequest(BaseModel):
    """Full strategy creation payload (sent after wizard completion)."""
    name: str
    description: str = ""
    magic_number: int = 0
    start_date: Optional[str] = None
    max_drawdown_limit: float = 0.0
    daily_loss_limit: float = 0.0


# --- Responses ---

class MetricSnapshotResponse(BaseModel):
    """Per-metric stats from backtest analysis."""
    name: str
    max_value: float
    mean_value: float
    std_value: float
    percentile_90: float
    percentile_95: float


class StrategyResponse(BaseModel):
    """Strategy summary for dashboard list."""
    id: str
    name: str
    description: str
    magic_number: int
    start_date: Optional[str]
    max_drawdown_limit: float
    daily_loss_limit: float
    total_trades: int
    net_profit: float
    equity_curve: Optional[list] = None
    gauss_params: Optional[dict] = None
    metrics_snapshot: Optional[dict] = None

    class Config:
        from_attributes = True


class StrategyListResponse(BaseModel):
    strategies: List[StrategyResponse]
