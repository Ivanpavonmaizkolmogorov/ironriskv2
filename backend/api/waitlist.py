"""Waitlist API — capture leads from traders without VIP code."""

from fastapi import APIRouter, Depends
from pydantic import BaseModel, EmailStr
from sqlalchemy.orm import Session

from models import get_db, WaitlistLead

router = APIRouter(prefix="/api/waitlist", tags=["Waitlist"])


class WaitlistRequest(BaseModel):
    email: EmailStr
    source: str = "register"


class WaitlistResponse(BaseModel):
    message: str
    already_registered: bool = False


@router.post("", response_model=WaitlistResponse)
async def add_to_waitlist(body: WaitlistRequest, db: Session = Depends(get_db)):
    email = body.email.strip().lower()

    # Check for duplicate
    existing = db.query(WaitlistLead).filter(WaitlistLead.email == email).first()
    if existing:
        return WaitlistResponse(
            message="Ya estás en la lista! 🛡️",
            already_registered=True,
        )

    # Insert new lead
    lead = WaitlistLead(email=email, source=body.source)
    db.add(lead)
    db.commit()

    return WaitlistResponse(
        message="¡Registrado! Te avisaremos cuando haya plazas. 🚀",
        already_registered=False,
    )
