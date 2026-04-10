"""Pydantic schemas for the public Simulation API."""

from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any


class SimulateRequest(BaseModel):
    # Manual mode parameters
    win_rate: Optional[float] = Field(None, ge=0.0, le=1.0, description="Win rate between 0 and 1")
    avg_win: Optional[float] = Field(None, description="Average win amount")
    avg_loss: Optional[float] = Field(None, description="Average loss amount (positive value)")
    std_win: Optional[float] = Field(None, description="Standard deviation of winning trades")
    std_loss: Optional[float] = Field(None, description="Standard deviation of losing trades")
    n_trades: Optional[int] = Field(None, ge=1, description="Number of trades in the backtest")
    
    # Optional parameters (not strictly needed for the core Bayes math, but good for context)
    max_drawdown: Optional[float] = None
    max_consecutive_losses: Optional[int] = None
    
    # CSV mode parameter
    csv_pnl: Optional[List[float]] = Field(None, description="Array of raw PnL values from CSV")


class DensityPoint(BaseModel):
    x: float
    density: float
    is_positive: bool


class SimulateResponse(BaseModel):
    # Return the full decomposition dict (matches EVDecomposition.to_dict())
    decomposition: Dict[str, Any]
    
    # Data for the interactive charts
    density_curve: List[DensityPoint]
    equity_paths: List[List[float]]  # list of simulated equity paths (Monte Carlo)
    
    # Optional stats extracted if using CSV
    extracted_stats: Optional[Dict[str, Any]] = None

    # Risk parameter suggestions extracted from Monte Carlo paths
    risk_suggestions: Optional[Dict[str, Any]] = None

    # Backtest equity curve from parsed file (same structure as workspace strategies)
    equity_curve: Optional[List[Dict[str, Any]]] = None
    
    # Last trade date from the parsed backtest data (auto start_date)
    last_trade_date: Optional[str] = None
