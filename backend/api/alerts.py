from fastapi import APIRouter, Depends, HTTPException
from typing import List, Optional
from pydantic import BaseModel

from sqlalchemy.orm import Session
from sqlalchemy import select, delete

from models.database import get_db
from models.user import User
from models.user_alerts import UserAlertConfig
from services.auth_service import get_current_user

router = APIRouter(prefix="/api/alerts", tags=["User Alerts"])

class AlertConfigCreateReq(BaseModel):
    target_type: str
    target_id: str
    metric_key: str
    operator: str
    threshold_value: float
    channel: str = "telegram"
    cooldown_minutes: int = 5
    is_active: bool = True

class AlertConfigResponse(AlertConfigCreateReq):
    id: str

@router.get("/user/all", response_model=List[AlertConfigResponse])
def get_all_user_alerts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Fetch ALL alert rules for the current user across all strategies/portfolios."""
    stmt = select(UserAlertConfig).where(
        UserAlertConfig.user_id == current_user.id
    )
    results = db.scalars(stmt).all()
    
    return [
        AlertConfigResponse(
            id=r.id,
            target_type=r.target_type,
            target_id=r.target_id,
            metric_key=r.metric_key,
            operator=r.operator,
            threshold_value=r.threshold_value,
            channel=r.channel,
            cooldown_minutes=r.cooldown_minutes,
            is_active=r.is_active
        )
        for r in results
    ]

@router.get("/{target_type}/{target_id}", response_model=List[AlertConfigResponse])
def get_alerts(
    target_type: str, 
    target_id: str, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    """Fetch all configured rules for a specific strategy or portfolio."""
    stmt = select(UserAlertConfig).where(
        UserAlertConfig.user_id == current_user.id,
        UserAlertConfig.target_type == target_type,
        UserAlertConfig.target_id == target_id
    )
    results = db.scalars(stmt).all()
    
    return [
        AlertConfigResponse(
            id=r.id,
            target_type=r.target_type,
            target_id=r.target_id,
            metric_key=r.metric_key,
            operator=r.operator,
            threshold_value=r.threshold_value,
            channel=r.channel,
            cooldown_minutes=r.cooldown_minutes,
            is_active=r.is_active
        ) for r in results
    ]

@router.post("", response_model=AlertConfigResponse)
def create_alert(
    req: AlertConfigCreateReq, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    """Add a new Ulysses Pact rule."""
    
    # Optional Validation: Only allow valid operator/channels maybe
    
    # Check if a rule for this target and metric already exists
    existing_stmt = select(UserAlertConfig).where(
        UserAlertConfig.user_id == current_user.id,
        UserAlertConfig.target_type == req.target_type,
        UserAlertConfig.target_id == req.target_id,
        UserAlertConfig.metric_key == req.metric_key
    )
    existing_alert = db.execute(existing_stmt).scalar_one_or_none()

    if existing_alert:
        existing_alert.threshold_value = req.threshold_value
        existing_alert.cooldown_minutes = req.cooldown_minutes
        existing_alert.operator = req.operator
        existing_alert.is_active = True
        db.commit()
        db.refresh(existing_alert)
        new_alert = existing_alert
    else:
        new_alert = UserAlertConfig(
            user_id=current_user.id,
            target_type=req.target_type,
            target_id=req.target_id,
            metric_key=req.metric_key,
            operator=req.operator,
            threshold_value=req.threshold_value,
            channel=req.channel,
            cooldown_minutes=req.cooldown_minutes,
            is_active=req.is_active
        )
        db.add(new_alert)
        db.commit()
        db.refresh(new_alert)
    
    return AlertConfigResponse(
        id=new_alert.id,
        target_type=new_alert.target_type,
        target_id=new_alert.target_id,
        metric_key=new_alert.metric_key,
        operator=new_alert.operator,
        threshold_value=new_alert.threshold_value,
        channel=new_alert.channel,
        cooldown_minutes=new_alert.cooldown_minutes,
        is_active=new_alert.is_active
    )

from typing import Optional

class AlertConfigUpdateReq(BaseModel):
    threshold_value: Optional[float] = None
    cooldown_minutes: Optional[int] = None

@router.patch("/{alert_id}", response_model=AlertConfigResponse)
def update_alert(
    alert_id: str,
    req: AlertConfigUpdateReq,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Update the threshold or cooldown of an existing alert rule."""
    stmt = select(UserAlertConfig).where(
        UserAlertConfig.id == alert_id,
        UserAlertConfig.user_id == current_user.id
    )
    alert = db.scalars(stmt).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    
    if req.threshold_value is not None:
        alert.threshold_value = req.threshold_value
    if req.cooldown_minutes is not None:
        alert.cooldown_minutes = req.cooldown_minutes
        
    db.commit()
    db.refresh(alert)
    
    return AlertConfigResponse(
        id=alert.id,
        target_type=alert.target_type,
        target_id=alert.target_id,
        metric_key=alert.metric_key,
        operator=alert.operator,
        threshold_value=alert.threshold_value,
        channel=alert.channel,
        cooldown_minutes=alert.cooldown_minutes,
        is_active=alert.is_active
    )

@router.delete("/user/all")
def delete_all_alerts(
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    """Delete ALL configured rules for the current user."""
    stmt = delete(UserAlertConfig).where(
        UserAlertConfig.user_id == current_user.id
    )
    db.execute(stmt)
    db.commit()
    return {"status": "ok", "message": "All alerts deleted"}

@router.delete("/{alert_id}")
def delete_alert(
    alert_id: str, 
    db: Session = Depends(get_db), 
    current_user: User = Depends(get_current_user)
):
    """Delete a generated rule."""
    stmt = select(UserAlertConfig).where(
        UserAlertConfig.id == alert_id,
        UserAlertConfig.user_id == current_user.id
    )
    alert = db.scalars(stmt).first()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
        
    db.delete(alert)
    db.commit()
    return {"status": "ok", "deleted_id": alert_id}

