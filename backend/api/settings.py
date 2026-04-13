from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from models.database import get_db
from models.user import User
from schemas.system_setting import SystemSettingResponse, SystemSettingUpdate, SystemSettingsListResponse
from services.settings_service import SettingsService
from services.auth_service import get_current_user

router = APIRouter()

@router.get("/public", response_model=SystemSettingsListResponse)
def get_public_settings(db: Session = Depends(get_db)):
    """Get public system settings for the frontend app."""
    settings = SettingsService.get_public_settings(db)
    return {"settings": settings}

@router.get("/{key}", response_model=SystemSettingResponse)
def get_setting(key: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    """Admin only: Get a specific setting by key."""
    if not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    
    setting = SettingsService.get_setting(db, key)
    if not setting:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Setting not found")
    return setting

@router.put("/{key}", response_model=SystemSettingResponse)
def update_setting(
    key: str, 
    update_data: SystemSettingUpdate, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    """Admin only: Update a specific setting."""
    if not current_user.is_admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    
    setting = SettingsService.set_setting(db, key, update_data.value, update_data.description)
    return setting
