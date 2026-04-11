"""Waitlist API — capture leads from traders without VIP code."""

from datetime import datetime
from typing import List
import threading

from fastapi import APIRouter, Depends
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from models import get_db, WaitlistLead, User
from api.auth import get_current_user
from services.email_service import EmailService

router = APIRouter(prefix="/api/waitlist", tags=["Waitlist"])

email_service = EmailService()


class WaitlistRequest(BaseModel):
    email: EmailStr
    source: str = "register"
    locale: str = "es"
    motivation: str = ""


class WaitlistResponse(BaseModel):
    message: str
    already_registered: bool = False


class WaitlistLeadOut(BaseModel):
    id: str
    email: str
    source: str
    notes: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True


@router.post("", response_model=WaitlistResponse)
async def add_to_waitlist(body: WaitlistRequest, db: Session = Depends(get_db)):
    email = body.email.strip().lower()

    # Check for duplicate
    existing = db.query(WaitlistLead).filter(WaitlistLead.email == email).first()
    if existing:
        return WaitlistResponse(
            message="Ya estás en la lista! 🛡️" if body.locale == "es" else "You're already on the list! 🛡️",
            already_registered=True,
        )

    # Insert new lead
    lead = WaitlistLead(email=email, source=body.source, notes=body.motivation.strip() or None)
    db.add(lead)
    db.commit()

    # Send confirmation email in background (don't block the response)
    threading.Thread(
        target=email_service.send_waitlist_confirmation,
        args=(email, body.locale),
        daemon=True,
    ).start()

    return WaitlistResponse(
        message="¡Registrado! Te avisaremos cuando haya plazas. 🚀" if body.locale == "es" else "Registered! We'll notify you when spots open. 🚀",
        already_registered=False,
    )


@router.get("", response_model=List[WaitlistLeadOut])
async def list_leads(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not user.is_admin:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Admin only")
    return db.query(WaitlistLead).order_by(WaitlistLead.created_at.desc()).all()


@router.delete("/{lead_id}")
async def delete_lead(lead_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not user.is_admin:
        from fastapi import HTTPException
        raise HTTPException(status_code=403, detail="Admin only")
    lead = db.query(WaitlistLead).filter(WaitlistLead.id == lead_id).first()
    if lead:
        db.delete(lead)
        db.commit()
    return {"ok": True}

