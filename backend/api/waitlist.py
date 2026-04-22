"""Waitlist API — capture leads + admin approve with magic link."""

from datetime import datetime, timezone
from typing import List
import threading

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from models import get_db, WaitlistLead, User
from api.auth import get_current_user
from services.email_service import EmailService
from services.auth_service import hash_password
from models.database import get_settings
from jose import jwt

router = APIRouter(prefix="/api/waitlist", tags=["Waitlist"])

email_service = EmailService()


class WaitlistRequest(BaseModel):
    email: EmailStr
    source: str = "register"
    locale: str = "es"
    motivation: str = ""
    password: str = ""


class WaitlistResponse(BaseModel):
    message: str
    already_registered: bool = False


class WaitlistLeadOut(BaseModel):
    id: str
    email: str
    source: str
    locale: str = "es"
    notes: str | None = None
    approved_at: datetime | None = None
    created_at: datetime

    class Config:
        from_attributes = True


@router.post("", response_model=WaitlistResponse)
async def add_to_waitlist(body: WaitlistRequest, db: Session = Depends(get_db)):
    email = body.email.strip().lower()

    # Check for duplicate
    existing = db.query(WaitlistLead).filter(WaitlistLead.email == email).first()
    if existing:
        # Update password_hash if provided and lead hasn't been approved yet
        if body.password and not existing.approved_at:
            existing.password_hash = hash_password(body.password)
            db.commit()
        return WaitlistResponse(
            message="¡Ya estás en la lista! 🛡️" if body.locale == "es" else "You're already on the list! 🛡️",
            already_registered=True,
        )

    # Hash password if provided
    pw_hash = hash_password(body.password) if body.password else None

    lead = WaitlistLead(
        email=email,
        source=body.source,
        locale=body.locale,
        password_hash=pw_hash,
        notes=body.motivation.strip() or None,
    )
    db.add(lead)
    db.commit()

    # Send waitlist confirmation email in background
    threading.Thread(
        target=email_service.send_waitlist_confirmation,
        args=(email, body.locale),
        daemon=True,
    ).start()

    return WaitlistResponse(
        message="¡Apuntado! Te avisaremos cuando haya plaza. 🚀" if body.locale == "es" else "You're on the list! We'll reach out when a spot opens. 🚀",
        already_registered=False,
    )


@router.get("", response_model=List[WaitlistLeadOut])
async def list_leads(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    return db.query(WaitlistLead).order_by(WaitlistLead.created_at.desc()).all()


@router.post("/{lead_id}/approve")
async def approve_lead(lead_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Admin approves a waitlist lead — generates a magic link and sends the access email."""
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")

    lead = db.query(WaitlistLead).filter(WaitlistLead.id == lead_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")

    # Generate magic JWT — no expiry, signed with app secret
    settings = get_settings()
    payload = {"email": lead.email, "purpose": "magic_access"}
    token = jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

    # Build frontend magic link URL
    frontend_url = getattr(settings, "FRONTEND_URL", "https://www.ironrisk.pro")
    locale = lead.locale or "es"
    magic_url = f"{frontend_url}/{locale}/auth/magic?token={token}"

    # Mark as approved
    lead.approved_at = datetime.now(timezone.utc)
    db.commit()

    # Send access email in background
    threading.Thread(
        target=email_service.send_access_granted_email,
        args=(lead.email, magic_url, locale),
        daemon=True,
    ).start()

    return {"status": "ok", "detail": f"Access email sent to {lead.email}"}


@router.delete("/{lead_id}")
async def delete_lead(lead_id: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Admin only")
    lead = db.query(WaitlistLead).filter(WaitlistLead.id == lead_id).first()
    if lead:
        db.delete(lead)
        db.commit()
    return {"ok": True}
