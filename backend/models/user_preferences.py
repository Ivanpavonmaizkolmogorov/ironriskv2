"""UserPreferences model — per-user theme and UI settings."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, DateTime, Text, ForeignKey, Integer
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class UserPreferences(Base):
    """Stores per-user preferences such as active theme.

    One-to-one relationship with User.  Created lazily on first
    GET /api/user/preferences (ThemeService.get_or_create).
    """

    __tablename__ = "user_preferences"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    theme: Mapped[str] = mapped_column(String(50), default="iron_dark", nullable=False)
    custom_theme_json: Mapped[str | None] = mapped_column(Text, nullable=True)
    telegram_chat_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    telegram_sync_token: Mapped[str | None] = mapped_column(String(36), nullable=True)
    locale: Mapped[str] = mapped_column(String(5), default="es", nullable=False)
    briefing_hour_utc: Mapped[int] = mapped_column(Integer, default=6, nullable=False)  # 0-23, default 6 = 08:00 CET
    last_briefing_date: Mapped[str | None] = mapped_column(String(10), nullable=True)  # "YYYY-MM-DD"
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    user = relationship("User", back_populates="preferences")
