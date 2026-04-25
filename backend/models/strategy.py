"""Strategy model — stores backtest data and risk parameters."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, DateTime, Integer, Float, Text, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class Strategy(Base):
    __tablename__ = "strategies"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    trading_account_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("trading_accounts.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True, default="")
    magic_number: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    
    # Aliases: additional magic numbers that belong to this same strategy
    # (e.g., trader reinstalled bot with a different magic)
    magic_aliases: Mapped[list] = mapped_column(JSON, nullable=True, default=list)
    
    @property
    def all_magic_numbers(self) -> list[int]:
        """Return primary magic + all aliases. Used for trade filtering."""
        aliases = self.magic_aliases or []
        return [self.magic_number] + [int(m) for m in aliases if m != self.magic_number]
    
    start_date: Mapped[str] = mapped_column(String(20), nullable=True)

    # Hard Stops (user-defined pain limits)
    max_drawdown_limit: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    daily_loss_limit: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    # Metrics snapshot — JSON blob from RiskEngine.analyze_backtest()
    metrics_snapshot: Mapped[dict] = mapped_column(JSON, nullable=True, default=dict)

    # Equity curve data for charts — JSON array
    equity_curve: Mapped[list] = mapped_column(JSON, nullable=True, default=list)

    # Gaussian distribution params for the bell chart (DEPRECATED → distribution_fit)
    gauss_params: Mapped[dict] = mapped_column(JSON, nullable=True, default=dict)

    # Statistical fit results — output of DistributionAnalyzer.analyze_strategy()
    # Keys are metric names, values are FitResult.to_dict()
    distribution_fit: Mapped[dict] = mapped_column(JSON, nullable=True, default=dict)

    # Risk configuration — which variables to monitor and their limits
    risk_config: Mapped[dict] = mapped_column(JSON, nullable=True, default=dict)

    # UI Configuration for the MT5 Dashboard
    dashboard_layout: Mapped[dict] = mapped_column(JSON, nullable=True, default=dict)

    # Trade count for stats
    total_trades: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    net_profit: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    # Bayesian backtest discount factor
    # 1.0 = real account (no discount), 20.0 = backtest/optimization tool
    bt_discount: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)

    # Risk Multiplier (Factor de Escalado)
    # Scales all backtest PnL by this factor before any calculation.
    # Use case: BT done at 0.01 lots, live at 1.0 lot → multiplier = 100.
    risk_multiplier: Mapped[float] = mapped_column(Float, nullable=False, default=1.0)

    # Original (un-scaled) equity curve — preserved so multiplier changes can re-derive
    original_equity_curve: Mapped[list] = mapped_column(JSON, nullable=True, default=list)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    # Relationships
    trading_account = relationship("TradingAccount", back_populates="strategies")
