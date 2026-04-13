from sqlalchemy import Column, String, Text, DateTime
from sqlalchemy.sql import func
from .database import Base

class SystemSetting(Base):
    """
    Global system configuration stored as key-value pairs.
    Allows changing system values from an admin panel without redeploying.
    """
    __tablename__ = "system_settings"

    key = Column(String(50), primary_key=True, index=True)
    value = Column(Text, nullable=False)
    description = Column(String(255), nullable=True)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
