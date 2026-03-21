"""Pydantic schemas for Trading Accounts requests/responses."""

from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class CreateTradingAccountRequest(BaseModel):
    name: str
    broker: Optional[str] = None
    account_number: Optional[str] = None


class TradingAccountResponse(BaseModel):
    id: str
    name: str
    broker: Optional[str] = None
    account_number: Optional[str] = None
    api_token: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True


class RevokeTradingAccountRequest(BaseModel):
    account_id: str
