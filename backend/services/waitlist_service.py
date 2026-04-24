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
from config.tutorials import get_tutorial_url

def get_beta_invite_text(locale: str) -> str:
    """Provides the exact copy from the frontend for Telegram/admin forwarding."""
    settings = get_settings()
    handle = getattr(settings, "ADMIN_TELEGRAM_HANDLE", "@IronRiskAdmin")
    url = f"https://t.me/{handle.replace('@', '')}"
    tutorial = get_tutorial_url(locale)
    
    if locale == "en":
        return f"🛡️ IronRisk — Closed Beta\n\n🌐 https://www.ironrisk.pro/en/register\n\n📺 Tutorial:\n{tutorial}\n\n💬 Direct support: {handle}\n{url}"
    else:
        return f"🛡️ IronRisk — Beta Privada\n\n🌐 https://www.ironrisk.pro/es/register\n\n📺 Tutorial:\n{tutorial}\n\n💬 Soporte directo: {handle}\n{url}"

def execute_lead_approval(db: Session, lead: WaitlistLead, silent: bool = False) -> str:
    """Core logic to approve a lead, create user and workspace, and (optionally) email the user."""
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
    if not silent:
        email_service = EmailService()
        threading.Thread(
            target=email_service.send_access_granted_email,
            args=(lead.email, login_url, locale),
            daemon=True,
        ).start()

    return "Success"
