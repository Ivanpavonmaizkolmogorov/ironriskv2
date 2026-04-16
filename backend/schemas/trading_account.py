"""Pydantic schemas for Trading Accounts requests/responses."""

from pydantic import BaseModel, field_validator
from typing import Optional, Any
from datetime import datetime, timezone


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
    default_dashboard_layout: Optional[dict] = None
    theme: Optional[str] = None
    has_connected: bool = False
    hostname: Optional[str] = None
    last_heartbeat_at: Optional[datetime] = None
    created_at: datetime

    @field_validator("last_heartbeat_at", "created_at", mode="before")
    @classmethod
    def ensure_tz(cls, v: Any) -> Any:
        if isinstance(v, datetime) and v.tzinfo is None:
            return v.replace(tzinfo=timezone.utc)
        return v

    class Config:
        from_attributes = True


class RevokeTradingAccountRequest(BaseModel):
    account_id: str


class UpdateWorkspaceSettingsRequest(BaseModel):
    """Schema for updating workspace-level settings (El Padre)."""
    default_dashboard_layout: Optional[Any] = None
    theme: Optional[str] = None
    name: Optional[str] = None
