"""Installer Telemetry — receives success/fail pings from the .bat installer."""

import logging
from datetime import datetime, timezone
from fastapi import APIRouter, Form
from models.database import get_settings

logger = logging.getLogger("ironrisk.installer")

router = APIRouter(tags=["Installer Telemetry"])


async def _notify_admin_telegram(message: str):
    """Send a Telegram message to the admin (first linked chat)."""
    try:
        settings = get_settings()
        bot_token = getattr(settings, "TELEGRAM_BOT_TOKEN", None)
        admin_chat = getattr(settings, "ADMIN_TELEGRAM_CHAT_ID", None)
        if not bot_token or not admin_chat:
            return
        import httpx
        url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
        async with httpx.AsyncClient() as client:
            await client.post(url, json={
                "chat_id": admin_chat,
                "text": message,
                "parse_mode": "HTML",
            })
    except Exception as e:
        logger.error(f"Failed to notify admin via Telegram: {e}")


@router.post("/api/installer-telemetry")
async def installer_telemetry(
    token: str = Form("unknown"),
    status: str = Form("unknown"),
    terminals: str = Form("0"),
    error: str = Form(""),
    os: str = Form("unknown"),
):
    """
    Receives a telemetry ping from the .bat installer.
    Logs the event and optionally notifies the admin via Telegram.
    """
    ts = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S UTC")
    token_short = token[:12] + "..." if len(token) > 12 else token

    if status == "ok":
        msg = (
            f"✅ <b>Installer OK</b>\n"
            f"Token: <code>{token_short}</code>\n"
            f"Terminals: {terminals}\n"
            f"OS: {os}\n"
            f"Time: {ts}"
        )
        logger.info(f"[INSTALLER OK] token={token_short} terminals={terminals} os={os}")
    else:
        msg = (
            f"🚨 <b>Installer FAILED</b>\n"
            f"Token: <code>{token_short}</code>\n"
            f"Error: {error}\n"
            f"OS: {os}\n"
            f"Time: {ts}"
        )
        logger.warning(f"[INSTALLER FAIL] token={token_short} error={error} os={os}")

    # Always try to notify admin
    await _notify_admin_telegram(msg)

    return {"received": True, "status": status}
