from sqlalchemy import String, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.dialects.sqlite import JSON

from models.database import Base

class UserTheme(Base):
    """User-created custom theme."""
    __tablename__ = "user_themes"

    id: Mapped[str] = mapped_column(String, primary_key=True) # Usually a prefix like 'custom_<uuid>'
    user_id: Mapped[str] = mapped_column(String, ForeignKey("users.id", ondelete="CASCADE"))
    label: Mapped[str] = mapped_column(String(50))
    mode: Mapped[str] = mapped_column(String(10)) # "dark" | "light"
    colors: Mapped[dict] = mapped_column(JSON) # Dictionary matching built-in themes

    def __repr__(self) -> str:
        return f"<UserTheme {self.label} ({self.id})>"
