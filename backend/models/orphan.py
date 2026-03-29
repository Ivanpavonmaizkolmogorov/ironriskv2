from sqlalchemy import Column, String, Integer, DateTime, Float
from datetime import datetime
from .database import Base

class OrphanMagic(Base):
    """
    Plug & Play Sandbox: Tracks magic numbers seen from the EA
    that do not correspond to any known Strategy for this Account.
    """
    __tablename__ = "orphan_magics"

    id = Column(Integer, primary_key=True, index=True)
    account_id = Column(String, index=True)
    magic_number = Column(Integer, index=True)
    first_seen = Column(DateTime, default=datetime.utcnow)
    last_seen = Column(DateTime, default=datetime.utcnow)
    current_pnl = Column(Float, default=0.0)
