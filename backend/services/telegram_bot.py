"""Telegram Bot Command Handler — Background polling for /status and /help commands."""

import asyncio
import logging
from datetime import datetime, timezone

import httpx

from models.database import SessionLocal, get_settings
from models.user_preferences import UserPreferences
from models.trading_account import TradingAccount

logger = logging.getLogger("ironrisk.telegram_bot")

# Track last processed update_id to avoid re-processing
_last_update_id = 0


async def _get_bot_token() -> str | None:
    settings = get_settings()
    return getattr(settings, "TELEGRAM_BOT_TOKEN", None)


def _build_status_response(chat_id: str) -> str:
    """Check EA connectivity for the user linked to this chat_id."""
    with SessionLocal() as db:
        prefs = db.query(UserPreferences).filter(
            UserPreferences.telegram_chat_id == chat_id
        ).first()

        if not prefs:
            return "⚠️ Tu cuenta de Telegram no está vinculada a ninguna cuenta de IronRisk."

        # Find all trading accounts for this user
        accounts = db.query(TradingAccount).filter(
            TradingAccount.user_id == prefs.user_id,
            TradingAccount.is_active == True,
        ).all()

        if not accounts:
            return "📊 No tienes cuentas de trading activas registradas en IronRisk."

        now = datetime.now(timezone.utc)
        lines = ["🖥️ <b>Estado de conexión EA</b>\n"]

        for acc in accounts:
            name = acc.name or acc.account_number or str(acc.id)[:8]
            if acc.last_heartbeat_at:
                last_hb = acc.last_heartbeat_at
                if last_hb.tzinfo is None:
                    last_hb = last_hb.replace(tzinfo=timezone.utc)
                elapsed = (now - last_hb).total_seconds()
                mins = int(elapsed / 60)

                if mins < 5:
                    lines.append(f"  ✅ <b>{name}</b> — Activo (hace {mins} min)")
                elif mins < 30:
                    lines.append(f"  ⚠️ <b>{name}</b> — Sin señal ({mins} min)")
                else:
                    hours = mins // 60
                    if hours > 0:
                        lines.append(f"  🔴 <b>{name}</b> — Desconectado ({hours}h {mins % 60}m)")
                    else:
                        lines.append(f"  🔴 <b>{name}</b> — Desconectado ({mins} min)")
            else:
                lines.append(f"  ⚪ <b>{name}</b> — Sin datos de heartbeat")

        return "\n".join(lines)


def _build_help_response() -> str:
    return (
        "📌 <b>Comandos IronRisk Bot</b>\n\n"
        "/status — Comprobar si tu EA sigue conectado\n"
        "/help — Ver esta lista de comandos\n\n"
        "Las alertas de riesgo se envían automáticamente cuando se activan las reglas configuradas en el Centro de Alertas."
    )


async def _send_message(bot_token: str, chat_id: str, text: str):
    """Send a message via Telegram Bot API and return message_id."""
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    async with httpx.AsyncClient() as client:
        try:
            resp = await client.post(url, json={
                "chat_id": chat_id,
                "text": text,
                "parse_mode": "HTML",
            }, timeout=10.0)
            if resp.status_code != 200:
                logger.error(f"Telegram sendMessage error: {resp.text}")
                return None
            return resp.json().get("result", {}).get("message_id")
        except Exception as e:
            logger.error(f"Failed to send Telegram message: {e}")
            return None

async def _pin_message(bot_token: str, chat_id: str, message_id: int):
    """Pin a message using Telegram Bot API."""
    url = f"https://api.telegram.org/bot{bot_token}/pinChatMessage"
    async with httpx.AsyncClient() as client:
        try:
            await client.post(url, json={
                "chat_id": chat_id,
                "message_id": message_id,
                "disable_notification": True
            }, timeout=5.0)
        except Exception:
            pass


async def telegram_bot_poller():
    """Background task that polls Telegram getUpdates and responds to commands."""
    global _last_update_id

    bot_token = await _get_bot_token()
    if not bot_token:
        logger.warning("TELEGRAM_BOT_TOKEN not set — bot poller disabled.")
        return

    logger.info("🤖 Telegram Bot Poller started.")

    while True:
        try:
            url = f"https://api.telegram.org/bot{bot_token}/getUpdates"
            params = {"timeout": 30, "allowed_updates": ["message"]}
            if _last_update_id > 0:
                params["offset"] = _last_update_id + 1

            async with httpx.AsyncClient() as client:
                resp = await client.get(url, params=params, timeout=35.0)
                data = resp.json()

                if not data.get("ok"):
                    logger.error(f"getUpdates error: {data}")
                    await asyncio.sleep(5)
                    continue

                for update in data.get("result", []):
                    update_id = update.get("update_id", 0)
                    if update_id > _last_update_id:
                        _last_update_id = update_id

                    msg = update.get("message", {})
                    text = msg.get("text", "").strip()
                    chat_id = str(msg.get("chat", {}).get("id", ""))

                    if not text or not chat_id:
                        continue

                    # Command routing
                    cmd = text.split()[0].lower()
                    if cmd == "/status":
                        response = _build_status_response(chat_id)
                        await _send_message(bot_token, chat_id, response)
                    elif cmd == "/help":
                        response = _build_help_response()
                        await _send_message(bot_token, chat_id, response)
                    elif cmd == "/start":
                        parts = text.split()
                        if len(parts) > 1:
                            sync_token = parts[1]
                            with SessionLocal() as db:
                                prefs = db.query(UserPreferences).filter(UserPreferences.telegram_sync_token == sync_token).first()
                                if prefs:
                                    prefs.telegram_chat_id = chat_id
                                    prefs.telegram_sync_token = None
                                    db.commit()
                                    
                                    # Custom Welcome Message
                                    welcome_msg = (
                                        "🛡️ <b>IronRisk Shield Activado!</b>\n\n"
                                        "Estás conectado. A partir de ahora recibirás aquí tus notificaciones y alertas de riesgo de IronRisk.\n\n"
                                        "📌 <b>Comandos disponibles:</b>\n"
                                        "/status — Comprobar si tu EA sigue conectado\n"
                                        "/help — Ver esta lista de comandos"
                                    )
                                    msg_id = await _send_message(bot_token, chat_id, welcome_msg)
                                    if msg_id:
                                        await _pin_message(bot_token, chat_id, msg_id)
                        else:
                            # User just clicked start without deep link
                            await _send_message(bot_token, chat_id, "⚠️ Para conectar tu cuenta de IronRisk, inicia el bot desde el enlace generado en el Centro de Alertas en la aplicación web.")
                    # Unknown commands — silently ignore

        except httpx.ReadTimeout:
            # Normal for long polling — no updates received
            pass
        except Exception as e:
            logger.error(f"Bot poller error: {e}")
            await asyncio.sleep(5)

        # Small delay between poll cycles
        await asyncio.sleep(1)
