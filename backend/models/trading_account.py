"""TradingAccount model — unique MT5 connection entity."""

import uuid
import secrets
from datetime import datetime, timezone

from sqlalchemy import String, DateTime, Boolean, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def generate_api_token() -> str:
    """Generate a secure random API token prefixed with 'irk_'."""
    return f"irk_{secrets.token_urlsafe(32)}"


class TradingAccount(Base):
    __tablename__ = "trading_accounts"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    broker: Mapped[str] = mapped_column(String(100), nullable=True) # Optional
    account_number: Mapped[str] = mapped_column(String(50), nullable=True) # Optional
    hostname: Mapped[str] = mapped_column(String(100), nullable=True) # VPS/Computer name captured by installer
    api_token: Mapped[str] = mapped_column(
        String(64), unique=True, nullable=False, default=generate_api_token, index=True
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # UI Configuration for the MT5 Dashboard (Master Template for all workspace EAs)
    default_dashboard_layout: Mapped[dict] = mapped_column(JSON, nullable=True, default=dict)
    
    # Optional workspace-specific flavor override
    theme: Mapped[str | None] = mapped_column(String(50), nullable=True)

    last_heartbeat_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    # Relationships
    user = relationship("User", back_populates="trading_accounts")
    strategies = relationship("Strategy", back_populates="trading_account", cascade="all, delete-orphan")
    portfolios = relationship("Portfolio", back_populates="trading_account", cascade="all, delete-orphan")
    real_trades = relationship("RealTrade", back_populates="trading_account", cascade="all, delete-orphan")

    @property
    def has_connected(self) -> bool:
        return self.last_heartbeat_at is not None
