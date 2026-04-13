"""StrategyLink model — many-to-many join table for VS Mode twin linking."""

import uuid
from datetime import datetime, timezone

from sqlalchemy import String, DateTime, Float, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class StrategyLink(Base):
    """
    Represents a directional link between two strategies across workspaces.
    
    Links are stored bidirectionally:
    - When user links A→B, two rows are created: (A,B) and (B,A)
    - This simplifies querying: "all links for strategy X" = WHERE strategy_id = X
    
    The `match_window_seconds` is configurable per-link, defaulting to 60s.
    """
    __tablename__ = "strategy_links"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    
    # The strategy that "owns" this link row
    strategy_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("strategies.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    
    # The linked (twin) strategy
    linked_strategy_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("strategies.id", ondelete="CASCADE"),
        nullable=False, index=True
    )
    
    # Configurable matching window for trade pairing (seconds)
    match_window_seconds: Mapped[float] = mapped_column(
        Float, nullable=False, default=60.0
    )
    
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    
    # Prevent duplicate links
    __table_args__ = (
        UniqueConstraint("strategy_id", "linked_strategy_id", name="uq_strategy_link"),
    )
