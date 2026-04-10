"""User Alerts models — Stores user-defined rules and their execution history."""

import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, Float, Boolean, ForeignKey, Enum, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base

class UserAlertConfig(Base):
    """Stores a single user-defined rule for alerts (The Ulysses Pact)."""
    __tablename__ = "user_alert_configs"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    
    # "account" (global config like EA Disconnect), "portfolio", "strategy"
    target_type: Mapped[str] = mapped_column(String(20), nullable=False)
    
    # ID of the specific strategy/portfolio/account. Nullable if it's meant to apply universally.
    target_id: Mapped[str | None] = mapped_column(String(36), nullable=True)
    
    # Metric being evaluated (e.g. "max_drawdown", "consec_losses", "ea_disconnect")
    metric_key: Mapped[str] = mapped_column(String(50), nullable=False)
    
    # > (greater), < (less), >=, <=, ==
    operator: Mapped[str] = mapped_column(String(5), nullable=False)
    
    # The limit value (e.g., 5000 for drawdown limit, 0.95 for percentile, etc.)
    threshold_value: Mapped[float] = mapped_column(Float, nullable=False)
    
    # Delivery channel: "telegram", "email"
    channel: Mapped[str] = mapped_column(String(20), default="telegram", nullable=False)
    
    # Max times to notify (anti-spam). 0 means immediate/always, >0 specifies minutes of wait time.
    cooldown_minutes: Mapped[int] = mapped_column(default=720) # default 12 hours
    
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class UserAlertHistory(Base):
    """Tracks every time an alert is fired to enforce cooldowns and provide an audit log."""
    __tablename__ = "user_alert_history"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    config_id: Mapped[str] = mapped_column(String(36), ForeignKey("user_alert_configs.id", ondelete="CASCADE"), nullable=False)
    
    triggered_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    
    # A snapshot of what caused the alert (e.g. the exact drawdown value)
    value_at_trigger: Mapped[float] = mapped_column(Float, nullable=False)
    message_sent: Mapped[str] = mapped_column(String(500), nullable=False)
