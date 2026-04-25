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


@router.get("/db-diag")
def db_diagnostic(db: Session = Depends(get_db), user: User = Depends(get_admin_user)):
    """Quick diagnostic: alembic version, user_preferences columns, strategy bt_discount sample."""
    alembic_ver = db.execute(text("SELECT version_num FROM alembic_version")).scalars().all()
    cols = db.execute(text(
        "SELECT column_name FROM information_schema.columns WHERE table_name = 'user_preferences' ORDER BY ordinal_position"
    )).scalars().all()
    sample = db.execute(text("SELECT bt_discount FROM strategies LIMIT 3")).scalars().all()
    return {"alembic_version": alembic_ver, "user_preferences_columns": cols, "bt_discount_sample": sample}


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


# ─────────────────────────────────────────────
# Trigger Daily Broadcast (Admin-only)
# ─────────────────────────────────────────────

@router.post("/trigger-alert")
async def trigger_alert(
    alert_type: str,
    admin: User = Depends(get_admin_user),
    db: Session = Depends(get_db),
):
    """Admin-only: Fire a specific alert type for testing.
    
    alert_type options:
      Telegram: morning_briefing, status, help, welcome
      Email: welcome_email, password_reset, waitlist, health_check
    """
    from services.telegram_bot import _execute_broadcast, _get_bot_token, _build_status_response, _build_help_response, _send_message
    from models.user_preferences import UserPreferences

    # Get admin's Telegram chat_id
    prefs = db.query(UserPreferences).filter(UserPreferences.user_id == admin.id).first()
    chat_id = prefs.telegram_chat_id if prefs else None
    locale = prefs.locale if prefs else "es"

    # ── TELEGRAM ALERTS ──
    if alert_type == "morning_briefing":
        bot_token = await _get_bot_token()
        if not bot_token:
            raise HTTPException(status_code=500, detail="TELEGRAM_BOT_TOKEN not configured.")
        await _execute_broadcast(bot_token)
        return {"status": "ok", "detail": "Morning briefing sent to all linked users."}

    elif alert_type == "status":
        if not chat_id:
            raise HTTPException(status_code=400, detail="No Telegram chat linked to your account.")
        bot_token = await _get_bot_token()
        response = _build_status_response(chat_id)
        await _send_message(bot_token, chat_id, response)
        return {"status": "ok", "detail": "Status sent to your Telegram."}

    elif alert_type == "help":
        if not chat_id:
            raise HTTPException(status_code=400, detail="No Telegram chat linked to your account.")
        bot_token = await _get_bot_token()
        response = _build_help_response(chat_id)
        await _send_message(bot_token, chat_id, response)
        return {"status": "ok", "detail": "Help message sent to your Telegram."}

    elif alert_type == "welcome":
        if not chat_id:
            raise HTTPException(status_code=400, detail="No Telegram chat linked to your account.")
        bot_token = await _get_bot_token()
        from services.translations import get_text
        title = get_text(locale, "welcome_title")
        body = get_text(locale, "welcome_body")
        welcome_msg = f"{title}\n\n{body}"
        await _send_message(bot_token, chat_id, welcome_msg)
        return {"status": "ok", "detail": "Welcome message sent to your Telegram."}

    elif alert_type == "disconnect_warning":
        if not chat_id:
            raise HTTPException(status_code=400, detail="No Telegram chat linked to your account.")
        bot_token = await _get_bot_token()
        if locale == "en":
            msg = "🔴 <b>DISCONNECTION ALERT</b>\n\n⚠️ Node <b>DemoAccount</b> has been offline for <b>15 minutes</b>.\n\nCheck your MT5 terminal and IronRisk Service."
        else:
            msg = "🔴 <b>ALERTA DE DESCONEXIÓN</b>\n\n⚠️ El nodo <b>DemoAccount</b> lleva <b>15 minutos</b> sin señal.\n\nRevisa tu terminal MT5 y el Servicio de IronRisk."
        await _send_message(bot_token, chat_id, msg)
        return {"status": "ok", "detail": "Disconnect warning sent to your Telegram."}

    elif alert_type == "duplicate_warning":
        if not chat_id:
            raise HTTPException(status_code=400, detail="No Telegram chat linked to your account.")
        bot_token = await _get_bot_token()
        if locale == "en":
            msg = "🚨 <b>DUPLICATE INSTALLATION DETECTED</b>\n\n⚠️ Node <b>DemoAccount</b> is being accessed from multiple machines simultaneously:\n  • <b>VPS-1</b>\n  • <b>LOCAL-PC</b>\n\nFor safety, keep the Service active on a single computer only."
        else:
            msg = "🚨 <b>INSTALACIÓN DUPLICADA DETECTADA</b>\n\n⚠️ El nodo <b>DemoAccount</b> está siendo accedido desde múltiples máquinas simultáneamente:\n  • <b>VPS-1</b>\n  • <b>LOCAL-PC</b>\n\nPor seguridad, mantén el Servicio activo en un solo ordenador."
        await _send_message(bot_token, chat_id, msg)
        return {"status": "ok", "detail": "Duplicate warning sent to your Telegram."}

    elif alert_type == "transition":
        if not chat_id:
            raise HTTPException(status_code=400, detail="No Telegram chat linked to your account.")
        bot_token = await _get_bot_token()
        from services.humanizer import PythonHumanizer
        hum = PythonHumanizer(locale=locale)
        headline = hum.verdict_headline("amber")
        
        from services.translations import get_text
        title = get_text(locale, "transition_title", portfolio_name="Demo Portfolio")
        reasons_title = get_text(locale, "transition_reasons")
        
        msg = f"{title}\n\n"
        msg += f"<b>AMBER</b> — <i>{headline}</i>\n\n"
        msg += f"{reasons_title}\n"
        msg += "• " + hum.gauge_narrative("consec_losses", "WARN", 5, 87.5) + "\n"
        msg += "• " + hum.gauge_narrative("stagnation_days", "WARN", 12, 91.2) + "\n"
        
        await _send_message(bot_token, chat_id, msg)
        return {"status": "ok", "detail": "Transition alert sent to your Telegram."}

    # ── PACTO DE ULISES (ULYSSES PACT) ALERTS ──
    elif alert_type == "ulises_drawdown":
        if not chat_id:
            raise HTTPException(status_code=400, detail="No Telegram chat linked to your account.")
        bot_token = await _get_bot_token()
        from services.translations import get_text
        title = get_text(locale, "alert_title_risk", target_type_upper="ESTRATEGIA")
        metric_line = get_text(locale, "alert_metric_line", metric_key="max_drawdown", operator=">", threshold_value=15.0)
        value_line = get_text(locale, "alert_value_line", current_value=16.5)
        id_line = get_text(locale, "alert_id_line", target_name="Golden Crossover V2", account_name="FTMO Challenge")
        message = f"{title}\n\n{metric_line}\n{value_line}\n\n{id_line}"
        await _send_message(bot_token, chat_id, message)
        return {"status": "ok", "detail": "Ulysses Drawdown alert sent to your Telegram."}

    elif alert_type == "ulises_consec_losses":
        if not chat_id:
            raise HTTPException(status_code=400, detail="No Telegram chat linked to your account.")
        bot_token = await _get_bot_token()
        from services.translations import get_text
        title = get_text(locale, "alert_title_risk", target_type_upper="CUENTA")
        metric_line = get_text(locale, "alert_metric_line", metric_key="consec_losses", operator=">=", threshold_value=5.0)
        value_line = get_text(locale, "alert_value_line", current_value=5.0)
        id_line = get_text(locale, "alert_id_line", target_name="Nivel de Cuenta", account_name="MyForexFunds")
        message = f"{title}\n\n{metric_line}\n{value_line}\n\n{id_line}"
        await _send_message(bot_token, chat_id, message)
        return {"status": "ok", "detail": "Ulysses Consecutive Losses alert sent to your Telegram."}

    elif alert_type == "ulises_margin":
        if not chat_id:
            raise HTTPException(status_code=400, detail="No Telegram chat linked to your account.")
        bot_token = await _get_bot_token()
        from services.translations import get_text
        title = get_text(locale, "alert_title_risk", target_type_upper="PORTFOLIO")
        metric_line = get_text(locale, "alert_metric_line", metric_key="margin_level", operator="&lt;", threshold_value=200.0)
        value_line = get_text(locale, "alert_value_line", current_value=180.5)
        id_line = get_text(locale, "alert_id_line", target_name="Swing Trading", account_name="Darwinex")
        message = f"{title}\n\n{metric_line}\n{value_line}\n\n{id_line}"
        await _send_message(bot_token, chat_id, message)
        return {"status": "ok", "detail": "Ulysses Margin Level alert sent to your Telegram."}

    # ── EMAIL ALERTS ──
    elif alert_type == "welcome_email":
        svc = EmailService()
        if not svc.is_configured():
            raise HTTPException(status_code=500, detail="Email service not configured.")
        svc.send_welcome_email(admin.email, locale)
        return {"status": "ok", "detail": f"Welcome email sent to {admin.email}."}

    elif alert_type == "password_reset":
        svc = EmailService()
        if not svc.is_configured():
            raise HTTPException(status_code=500, detail="Email service not configured.")
        svc.send_password_reset_email(admin.email, "TEST_TOKEN_12345", locale)
        return {"status": "ok", "detail": f"Password reset email sent to {admin.email}."}

    elif alert_type == "waitlist":
        svc = EmailService()
        if not svc.is_configured():
            raise HTTPException(status_code=500, detail="Email service not configured.")
        svc.send_waitlist_confirmation(admin.email, locale)
        return {"status": "ok", "detail": f"Waitlist confirmation email sent to {admin.email}."}

    elif alert_type == "health_check":
        # Reuse the test-uptime logic — already handled by /test-uptime
        return {"status": "ok", "detail": "Use the 'Test Server' button for health check emails."}

    elif alert_type == "beta_reactivation":
        svc = EmailService()
        if not svc.is_configured():
            raise HTTPException(status_code=500, detail="Email service not configured.")
        svc.send_beta_reactivation(admin.email, locale)
        return {"status": "ok", "detail": f"Beta reactivation email ({locale}) sent to {admin.email}."}

    raise HTTPException(status_code=400, detail=f"Unknown alert_type: {alert_type}")


@router.post("/purge_alert_history")
def purge_alert_history(admin: User = Depends(get_admin_user), db: Session = Depends(get_db)):
    """Deletes all alert history (cooldown locks) for the admin, allowing immediate re-testing of proactive alerts."""
    from models.user_alerts import UserAlertHistory, UserAlertConfig
    
    # Get all configs for this user
    configs = db.query(UserAlertConfig).filter(UserAlertConfig.user_id == admin.id).all()
    config_ids = [c.id for c in configs]
    
    if config_ids:
        deleted = db.query(UserAlertHistory).filter(UserAlertHistory.config_id.in_(config_ids)).delete(synchronize_session=False)
        db.commit()
        return {"status": "ok", "detail": f"Purgados {deleted} registros de historial de alertas para tu usuario."}
    
    return {"status": "ok", "detail": "No hay historial de alertas que purgar."}


@router.get("/debug-watchdog")
def debug_watchdog(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Diagnostic: simulates what the ea_connectivity_watchdog sees right now."""
    if not user.is_admin:
        raise HTTPException(403)
    
    from models.trading_account import TradingAccount
    from models.user_alerts import UserAlertConfig, UserAlertHistory
    from models.user_preferences import UserPreferences
    from sqlalchemy import select
    
    now = datetime.now(timezone.utc)
    accounts = db.query(TradingAccount).filter(TradingAccount.is_active == True).all()
    
    results = []
    for acc in accounts:
        entry = {
            "account_name": acc.name,
            "account_id": acc.id,
            "user_id": acc.user_id,
            "last_heartbeat_at": str(acc.last_heartbeat_at) if acc.last_heartbeat_at else None,
            "elapsed_minutes": None,
            "would_dispatch": False,
            "alert_configs_found": 0,
            "alert_configs": [],
            "history_entries": [],
            "telegram_chat_id": None,
        }
        
        if acc.last_heartbeat_at:
            last_hb = acc.last_heartbeat_at
            if last_hb.tzinfo is None:
                last_hb = last_hb.replace(tzinfo=timezone.utc)
            elapsed = (now - last_hb).total_seconds() / 60.0
            entry["elapsed_minutes"] = round(elapsed, 2)
            entry["would_dispatch"] = elapsed >= 1
        
        # Check alert configs matching exactly what the watchdog queries
        configs = db.scalars(select(UserAlertConfig).where(
            UserAlertConfig.user_id == acc.user_id,
            UserAlertConfig.target_type == "account",
            UserAlertConfig.target_id == acc.id,
            UserAlertConfig.is_active == True
        )).all()
        entry["alert_configs_found"] = len(configs)
        
        for c in configs:
            hist = db.execute(select(UserAlertHistory).where(
                UserAlertHistory.config_id == c.id
            ).order_by(UserAlertHistory.triggered_at.desc()).limit(1)).scalar_one_or_none()
            
            entry["alert_configs"].append({
                "id": c.id,
                "metric_key": c.metric_key,
                "operator": c.operator,
                "threshold": c.threshold_value,
                "cooldown_minutes": c.cooldown_minutes,
                "channel": c.channel,
            })
            if hist:
                entry["history_entries"].append({
                    "config_id": c.id,
                    "triggered_at": str(hist.triggered_at),
                    "value_at_trigger": hist.value_at_trigger,
                })
        
        # Also find ALL disconnect configs for the user (detect target_id mismatch)
        all_dc = db.scalars(select(UserAlertConfig).where(
            UserAlertConfig.user_id == acc.user_id,
            UserAlertConfig.metric_key == "ea_disconnect_minutes"
        )).all()
        entry["all_disconnect_configs_for_user"] = [
            {"id": c.id, "target_type": c.target_type, "target_id": c.target_id, "threshold": c.threshold_value}
            for c in all_dc
        ]
        
        # Check telegram
        prefs = db.execute(select(UserPreferences).where(
            UserPreferences.user_id == acc.user_id
        )).scalar_one_or_none()
        entry["telegram_chat_id"] = prefs.telegram_chat_id if prefs else None
        
        results.append(entry)
    
    return {"now_utc": str(now), "accounts": results}
