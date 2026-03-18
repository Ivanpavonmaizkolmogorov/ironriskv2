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
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=True, default="")
    magic_number: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    start_date: Mapped[str] = mapped_column(String(20), nullable=True)

    # Hard Stops (user-defined pain limits)
    max_drawdown_limit: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    daily_loss_limit: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    # Metrics snapshot — JSON blob from RiskEngine.analyze_backtest()
    metrics_snapshot: Mapped[dict] = mapped_column(JSON, nullable=True, default=dict)

    # Equity curve data for charts — JSON array
    equity_curve: Mapped[list] = mapped_column(JSON, nullable=True, default=list)

    # Gaussian distribution params for the bell chart
    gauss_params: Mapped[dict] = mapped_column(JSON, nullable=True, default=dict)

    # Trade count for stats
    total_trades: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    net_profit: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    # Relationships
    user = relationship("User", back_populates="strategies")
