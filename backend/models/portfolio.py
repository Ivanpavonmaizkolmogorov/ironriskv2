"""Portfolio model — combines multiple strategies into a single tracked entity."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, DateTime, Integer, Float, Text, Boolean, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class Portfolio(Base):
    __tablename__ = "portfolios"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    trading_account_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("trading_accounts.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)

    # Which strategies are included (list of strategy IDs)
    strategy_ids: Mapped[list] = mapped_column(JSON, nullable=False, default=list)

    # Auto-include newly created strategies
    auto_include_new: Mapped[bool] = mapped_column(Boolean, default=True)

    # System-generated default portfolio (one per account, cannot be deleted)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False)

    # Computed from merged equity curves of included strategies
    equity_curve: Mapped[list] = mapped_column(JSON, nullable=True, default=list)
    metrics_snapshot: Mapped[dict] = mapped_column(JSON, nullable=True, default=dict)
    gauss_params: Mapped[dict] = mapped_column(JSON, nullable=True, default=dict)
    distribution_fit: Mapped[dict] = mapped_column(JSON, nullable=True, default=dict)

    # Risk configuration (same structure as Strategy.risk_config)
    risk_config: Mapped[dict] = mapped_column(JSON, nullable=True, default=dict)
    max_drawdown_limit: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    daily_loss_limit: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    # UI Configuration for the MT5 Dashboard
    dashboard_layout: Mapped[dict] = mapped_column(JSON, nullable=True, default=dict)

    # Aggregated stats
    total_trades: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    net_profit: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    # Relationships
    trading_account = relationship("TradingAccount", back_populates="portfolios")
