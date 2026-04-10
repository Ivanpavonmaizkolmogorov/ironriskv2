"""RealTrade model — stores real MT5 closed deals synced by the EA."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, Integer, Float, DateTime, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class RealTrade(Base):
    __tablename__ = "real_trades"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    trading_account_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("trading_accounts.id"), nullable=False, index=True
    )
    
    # Core MT5 Deal Data
    ticket: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    magic_number: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    symbol: Mapped[str] = mapped_column(String(50), nullable=True)
    volume: Mapped[float] = mapped_column(Float, nullable=True, default=0.0)
    
    # Advanced Trade Data (added in v64)
    open_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=True)
    open_price: Mapped[float] = mapped_column(Float, nullable=True)
    close_price: Mapped[float] = mapped_column(Float, nullable=True)
    sl: Mapped[float] = mapped_column(Float, nullable=True)
    tp: Mapped[float] = mapped_column(Float, nullable=True)
    deal_type: Mapped[str] = mapped_column(String(10), nullable=True) # "Buy" or "Sell"
    
    commission: Mapped[float] = mapped_column(Float, nullable=True, default=0.0)
    swap: Mapped[float] = mapped_column(Float, nullable=True, default=0.0)
    
    # Profit encompasses deal profit + swap + commission
    profit: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    
    # Trade comment (from DEAL_COMMENT, often contains strategy name)
    comment: Mapped[str] = mapped_column(String(200), nullable=True, default=None)
    
    # Timestamps
    close_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    # Relationships
    trading_account = relationship("TradingAccount", back_populates="real_trades")
