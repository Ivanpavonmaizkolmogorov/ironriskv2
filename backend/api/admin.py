"""Admin API — Feature Flags + User Management + Server Monitoring."""

import logging
from typing import List, Dict, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from pydantic import BaseModel

from models.database import get_db, SessionLocal
from services.email_service import EmailService

logger = logging.getLogger(__name__)
from models.user import User
from models.feature_flag import FeatureFlag
from services.auth_service import get_current_user

router = APIRouter(prefix="/api/admin", tags=["Admin"])


def get_admin_user(user: User = Depends(get_current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Not authorized. Admin privileges required.")
    return user


class FeatureFlagUpdate(BaseModel):
    tier: str  # "free", "pro", "enterprise"


# We want all users to be able to read feature flags to decide what to show
@router.get("/features", response_model=Dict[str, str])
def get_feature_flags(db: Session = Depends(get_db)):
    """Publicly accessible metadata for clients to configure UI."""
    flags = db.query(FeatureFlag).all()
    # Default return empty if none set
    return {f.key: f.tier for f in flags}


# Only admin can create or update feature flags
@router.patch("/features/{key}")
def update_feature_flag(
    key: str, 
    update: FeatureFlagUpdate, 
    db: Session = Depends(get_db), 
    admin: User = Depends(get_admin_user)
):
    """Admin-only: Create or update a feature flag tier."""
    if update.tier not in ["free", "pro", "enterprise"]:
        raise HTTPException(status_code=400, detail="Invalid tier")
        
    flag = db.query(FeatureFlag).filter(FeatureFlag.key == key).first()
    
    if flag:
        flag.tier = update.tier
    else:
        # Create it if it doesn't exist yet
        flag = FeatureFlag(key=key, tier=update.tier, label=key)
        db.add(flag)
        
    db.commit()
    return {"key": key, "tier": update.tier}


# ─────────────────────────────────────────────
# User Management (Admin-only)
# ─────────────────────────────────────────────

class AdminUserResponse(BaseModel):
    id: str
    email: str
    is_admin: bool
    created_at: Optional[datetime] = None
    trading_accounts_count: int = 0
    strategies_count: int = 0

    class Config:
        from_attributes = True


class AdminUserUpdate(BaseModel):
    is_admin: Optional[bool] = None
    password: Optional[str] = None


@router.get("/users", response_model=List[AdminUserResponse])
def list_users(
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """List all registered users with account/strategy counts."""
    from models.trading_account import TradingAccount
    from models.strategy import Strategy

    users = db.query(User).order_by(User.created_at.desc()).all()
    result = []
    for u in users:
        acc_count = db.query(TradingAccount).filter(TradingAccount.user_id == u.id).count()
        # Count strategies across all accounts
        strat_count = (
            db.query(Strategy)
            .join(TradingAccount, Strategy.trading_account_id == TradingAccount.id)
            .filter(TradingAccount.user_id == u.id)
            .count()
        )
        result.append(AdminUserResponse(
            id=u.id,
            email=u.email,
            is_admin=u.is_admin,
            created_at=u.created_at,
            trading_accounts_count=acc_count,
            strategies_count=strat_count,
        ))
    return result


@router.delete("/users/{user_id}")
def delete_user(
    user_id: str,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Cascade-delete a user and all their data (accounts, strategies, preferences)."""
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own admin account.")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    email = user.email
    db.delete(user)  # SQLAlchemy cascade handles trading_accounts → strategies
    db.commit()
    return {"detail": f"User {email} and all associated data deleted."}


@router.patch("/users/{user_id}", response_model=AdminUserResponse)
def update_user(
    user_id: str,
    update: AdminUserUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Update user flags (e.g. promote to admin)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    if update.is_admin is not None:
        user.is_admin = update.is_admin

    if update.password is not None and update.password.strip():
        from services.auth_service import hash_password
        user.hashed_password = hash_password(update.password)

    db.commit()
    db.refresh(user)

    from models.trading_account import TradingAccount
    from models.strategy import Strategy
    acc_count = db.query(TradingAccount).filter(TradingAccount.user_id == user.id).count()
    strat_count = (
        db.query(Strategy)
        .join(TradingAccount, Strategy.trading_account_id == TradingAccount.id)
        .filter(TradingAccount.user_id == user.id)
        .count()
    )

    return AdminUserResponse(
        id=user.id,
        email=user.email,
        is_admin=user.is_admin,
        created_at=user.created_at,
        trading_accounts_count=acc_count,
        strategies_count=strat_count,
    )


# ─────────────────────────────────────────────
# Server Health Test (Admin-only)
# ─────────────────────────────────────────────

@router.post("/test-uptime")
def test_uptime(
    admin: User = Depends(get_admin_user),
):
    """
    Admin-only: Performs a full server health check and sends a
    confirmation email so you can verify monitoring is working.
    Checks: DB connectivity, email service, uptime.
    """
    import platform
    import psutil
    import os

    checks = {}

    # 1. Database connectivity
    try:
        with SessionLocal() as db:
            result = db.execute(text("SELECT COUNT(*) FROM users")).scalar()
            checks["database"] = {"status": "ok", "users": result}
    except Exception as e:
        checks["database"] = {"status": "error", "detail": str(e)}

    # 2. System info
    try:
        checks["system"] = {
            "os": platform.system(),
            "cpu_percent": psutil.cpu_percent(interval=0.5),
            "memory_percent": psutil.virtual_memory().percent,
            "disk_percent": psutil.disk_usage('/').percent,
            "uptime_hours": round((datetime.now(timezone.utc).timestamp() - psutil.boot_time()) / 3600, 1),
        }
    except Exception:
        checks["system"] = {"status": "psutil not available"}

    # 3. Send test email
    email_sent = False
    try:
        svc = EmailService()
        if svc.is_configured():
            from email.message import EmailMessage
            import smtplib

            now = datetime.now(timezone.utc).strftime("%d-%b-%Y %H:%M UTC")
            cpu = checks.get("system", {}).get("cpu_percent", "?")
            mem = checks.get("system", {}).get("memory_percent", "?")
            disk = checks.get("system", {}).get("disk_percent", "?")
            uptime_h = checks.get("system", {}).get("uptime_hours", "?")
            db_users = checks.get("database", {}).get("users", "?")

            html = f"""
            <html><body style="font-family: -apple-system, sans-serif; padding: 20px; background: #0d1117; color: #c9d1d9;">
            <div style="max-width: 500px; margin: 0 auto; background: #161b22; padding: 30px; border-radius: 12px; border-top: 4px solid #00e676; border: 1px solid #30363d;">
                <h2 style="color: #00e676; margin: 0 0 20px;">✅ IronRisk Server OK</h2>
                <p style="color: #8b949e; font-size: 14px;">Test ejecutado: <strong style="color: #c9d1d9;">{now}</strong></p>
                <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
                    <tr><td style="padding: 8px; color: #8b949e; border-bottom: 1px solid #30363d;">CPU</td>
                        <td style="padding: 8px; color: #c9d1d9; border-bottom: 1px solid #30363d; text-align: right;"><strong>{cpu}%</strong></td></tr>
                    <tr><td style="padding: 8px; color: #8b949e; border-bottom: 1px solid #30363d;">RAM</td>
                        <td style="padding: 8px; color: #c9d1d9; border-bottom: 1px solid #30363d; text-align: right;"><strong>{mem}%</strong></td></tr>
                    <tr><td style="padding: 8px; color: #8b949e; border-bottom: 1px solid #30363d;">Disco</td>
                        <td style="padding: 8px; color: #c9d1d9; border-bottom: 1px solid #30363d; text-align: right;"><strong>{disk}%</strong></td></tr>
                    <tr><td style="padding: 8px; color: #8b949e; border-bottom: 1px solid #30363d;">Uptime</td>
                        <td style="padding: 8px; color: #c9d1d9; border-bottom: 1px solid #30363d; text-align: right;"><strong>{uptime_h}h</strong></td></tr>
                    <tr><td style="padding: 8px; color: #8b949e;">DB Usuarios</td>
                        <td style="padding: 8px; color: #c9d1d9; text-align: right;"><strong>{db_users}</strong></td></tr>
                </table>
                <p style="font-size: 12px; color: #484f58; margin-top: 20px;">Este email confirma que tu servidor Hetzner, la base de datos y el servicio de correo están operativos.</p>
            </div>
            </body></html>
            """

            msg = EmailMessage()
            msg["Subject"] = f"✅ IronRisk Server Health — {now}"
            msg["From"] = f"IronRisk Monitor <{svc.sender_email}>"
            msg["To"] = admin.email
            msg.set_content("IronRisk Server Health Check passed.")
            msg.add_alternative(html, subtype="html")

            with smtplib.SMTP(svc.smtp_server, svc.smtp_port) as server:
                server.starttls()
                server.login(svc.sender_email, svc.sender_password)
                server.send_message(msg)

            email_sent = True
            checks["email"] = {"status": "sent", "to": admin.email}
        else:
            checks["email"] = {"status": "not_configured"}
    except Exception as e:
        checks["email"] = {"status": "error", "detail": str(e)}

    return {
        "status": "all_ok" if email_sent and checks.get("database", {}).get("status") == "ok" else "partial",
        "checks": checks,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

