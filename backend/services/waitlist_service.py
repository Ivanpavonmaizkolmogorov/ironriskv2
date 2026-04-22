"""Waitlist shared business logic."""

import threading
from datetime import datetime, timezone
import uuid as _uuid

from sqlalchemy.orm import Session

from models.database import get_settings
from models.user import User
from models.waitlist import WaitlistLead
from models.trading_account import TradingAccount
from services.email_service import EmailService

def execute_lead_approval(db: Session, lead: WaitlistLead) -> str:
    """Core logic to approve a lead, create user and workspace, and email the user."""
    if lead.approved_at:
        return "Already approved"
        
    if not lead.password_hash:
        raise ValueError("No password stored for this lead.")

    locale = lead.locale or "es"
    settings = get_settings()
    frontend_url = getattr(settings, "FRONTEND_URL", "https://www.ironrisk.pro")
    login_url = f"{frontend_url}/{locale}/login"

    # 1. Create User if missing
    existing_user = db.query(User).filter(User.email == lead.email).first()
    if not existing_user:
        new_user = User(
            id=str(_uuid.uuid4()),
            email=lead.email,
            hashed_password=lead.password_hash,
            email_verified=True,
            is_admin=False,
        )
        db.add(new_user)
        
        ws_name = "Mi Primer Workspace" if locale == "es" else "My First Workspace"
        
        # 2. Create Default Workspace
        default_ws = TradingAccount(
            id=str(_uuid.uuid4()),
            user_id=new_user.id,
            name=ws_name,
            account_number="",
            broker="",
        )
        db.add(default_ws)

    # 3. Mark Waitlist Lead as Approved
    lead.approved_at = datetime.now(timezone.utc)
    db.commit()

    # 4. Dispatch Email
    email_service = EmailService()
    threading.Thread(
        target=email_service.send_access_granted_email,
        args=(lead.email, login_url, locale),
        daemon=True,
    ).start()

    return "Success"
