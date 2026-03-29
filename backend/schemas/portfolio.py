"""Pydantic schemas for portfolio requests/responses."""

from pydantic import BaseModel
from typing import Optional, List


class PortfolioCreate(BaseModel):
    """Create a new portfolio."""
    trading_account_id: str
    name: str
    strategy_ids: List[str] = []


class PortfolioUpdate(BaseModel):
    """Update portfolio (toggle strategies, rename)."""
    name: Optional[str] = None
    strategy_ids: Optional[List[str]] = None
    risk_config: Optional[dict] = None


class PortfolioResponse(BaseModel):
    """Portfolio summary for dashboard."""
    id: str
    trading_account_id: str
    name: str
    strategy_ids: List[str]
    auto_include_new: bool
    is_default: bool
    equity_curve: Optional[list] = None
    gauss_params: Optional[dict] = None
    distribution_fit: Optional[dict] = None
    metrics_snapshot: Optional[dict] = None
    risk_config: Optional[dict] = None
    max_drawdown_limit: float
    daily_loss_limit: float
    total_trades: int
    net_profit: float

    class Config:
        from_attributes = True


class PortfolioListResponse(BaseModel):
    portfolios: List[PortfolioResponse]
