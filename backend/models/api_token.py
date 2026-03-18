"""APIToken model — unique token for EA authentication (no JWT)."""

import uuid
import secrets
from datetime import datetime, timezone

from sqlalchemy import String, DateTime, Boolean, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


def generate_api_token() -> str:
    """Generate a secure random API token prefixed with 'irk_'."""
    return f"irk_{secrets.token_urlsafe(32)}"


class APIToken(Base):
    __tablename__ = "api_tokens"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=False, index=True
    )
    token: Mapped[str] = mapped_column(
        String(64), unique=True, nullable=False, default=generate_api_token, index=True
    )
    label: Mapped[str] = mapped_column(String(100), nullable=True, default="Default")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    # Relationships
    user = relationship("User", back_populates="api_tokens")
