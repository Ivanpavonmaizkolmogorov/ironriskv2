from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class SystemSettingBase(BaseModel):
    value: str
    description: Optional[str] = None

class SystemSettingUpdate(SystemSettingBase):
    pass

class SystemSettingResponse(SystemSettingBase):
    key: str
    updated_at: Optional[datetime]
    
    class Config:
        from_attributes = True

class SystemSettingsListResponse(BaseModel):
    settings: list[SystemSettingResponse]
