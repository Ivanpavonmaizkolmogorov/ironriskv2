"""Telegram Bot Command Handler — Background polling for /status and /help commands."""

import asyncio
import logging
from datetime import datetime, timezone, timedelta

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
            return "⚠️ Tu cuenta de Telegram no está vinculada a ninguna cuenta de IronRisk.\n⚠️ Your Telegram account is not linked to any IronRisk account."

        lang = getattr(prefs, "locale", "es") or "es"

        # i18n strings
        T = {
            "es": {
                "title": "🖥️ <b>Estado de Nodos</b>\n",
                "no_accounts": "📊 No tienes cuentas de trading activas registradas en IronRisk.",
                "active": "Activo",
                "ago": "hace",
                "min": "min",
                "no_signal": "Sin señal",
                "disconnected": "Desconectado",
                "no_heartbeat": "Sin datos de conexión",
                "node": "Nodo",
                "dup_warn": "🚨 <i>ATENCIÓN: Se detectaron múltiples instalaciones simultáneas intentando conectar con esta misma cuenta. Por seguridad, sugerimos mantener el Servicio activo en un solo ordenador.</i>",
            },
            "en": {
                "title": "🖥️ <b>Node Status (Workspaces)</b>\n",
                "no_accounts": "📊 You have no active trading accounts registered in IronRisk.",
                "active": "Active",
                "ago": "",
                "min": "min ago",
                "no_signal": "No signal",
                "disconnected": "Disconnected",
                "no_heartbeat": "No heartbeat data",
                "node": "Node",
                "dup_warn": "🚨 <i>WARNING: Multiple simultaneous installations detected trying to connect with this account. For safety, keep the Service active on a single computer only.</i>",
            },
        }
        t = T.get(lang, T["es"])

        # Find all trading accounts for this user
        accounts = db.query(TradingAccount).filter(
            TradingAccount.user_id == prefs.user_id,
            TradingAccount.is_active == True,
        ).all()

        if not accounts:
            return t["no_accounts"]

        now = datetime.now(timezone.utc)
        lines = [t["title"]]

        for acc in accounts:
            name = acc.name or acc.account_number or str(acc.id)[:8]
            host_tag = f"  [{acc.hostname}]" if acc.hostname else ""

            if acc.last_heartbeat_at:
                last_hb = acc.last_heartbeat_at
                if last_hb.tzinfo is None:
                    last_hb = last_hb.replace(tzinfo=timezone.utc)
                elapsed = (now - last_hb).total_seconds()
                mins = int(elapsed / 60)

                if mins < 5:
                    if lang == "en":
                        lines.append(f"  ✅ <b>{name}</b> — {t['active']} ({mins} {t['min']}){host_tag}")
                    else:
                        lines.append(f"  ✅ <b>{name}</b> — {t['active']} ({t['ago']} {mins} {t['min']}){host_tag}")
                elif mins < 30:
                    lines.append(f"  ⚠️ <b>{name}</b> — {t['no_signal']} ({mins} min){host_tag}")
                else:
                    hours = mins // 60
                    if hours > 0:
                        lines.append(f"  🔴 <b>{name}</b> — {t['disconnected']} ({hours}h {mins % 60}m){host_tag}")
                    else:
                        lines.append(f"  🔴 <b>{name}</b> — {t['disconnected']} ({mins} min){host_tag}")
            else:
                lines.append(f"  ⚪ <b>{name}</b> — {t['no_heartbeat']}")
                
            # Check for duplicate connection warning
            layout = dict(acc.default_dashboard_layout or {})
            if layout.get("duplicate_warning"):
                lines.append(f"    {t['dup_warn']}")
                # Reset flag after warning
                layout["duplicate_warning"] = False
                from sqlalchemy.orm.attributes import flag_modified
                acc.default_dashboard_layout = layout
                flag_modified(acc, "default_dashboard_layout")
                db.commit()

        return "\n".join(lines)


def _build_help_response(chat_id: str) -> str:
    with SessionLocal() as db:
        prefs = db.query(UserPreferences).filter(UserPreferences.telegram_chat_id == chat_id).first()
        locale = getattr(prefs, "locale", "es") if prefs else "es"
    from services.translations import get_text
    title = get_text(locale, "help_title")
    body = get_text(locale, "help_body")
    return f"{title}\n\n{body}"


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


async def send_admin_notification(text: str):
    """Send a notification specifically to the configured admin chat."""
    bot_token = await _get_bot_token()
    if not bot_token:
        # Silently ignore if telegram isn't configured
        return
        
    settings = get_settings()
    chat_ids = []
    env_chat_id = getattr(settings, "ADMIN_TELEGRAM_CHAT_ID", None)
    
    if env_chat_id:
        chat_ids.append(env_chat_id)
    else:
        # Fallback: find all users with is_admin=True and a telegram_chat_id
        from models.database import SessionLocal
        from models.user import User
        try:
            with SessionLocal() as db:
                admins = db.query(UserPreferences.telegram_chat_id).join(
                    User, User.id == UserPreferences.user_id
                ).filter(
                    User.is_admin == True,
                    UserPreferences.telegram_chat_id.isnot(None)
                ).all()
                for (cid,) in admins:
                    if cid and cid not in chat_ids:
                        chat_ids.append(cid)
        except Exception as e:
            logger.error(f"Failed to lookup admin chat IDs: {e}")

    for cid in chat_ids:
        await _send_message(bot_token, cid, text)


async def _handle_mute_callback(bot_token: str, callback_id: str, chat_id: str, config_id: str):
    """Handle the '🔕 Silenciar' inline button press — deactivates the alert config."""
    try:
        with SessionLocal() as db:
            from models.user_alerts import UserAlertConfig
            config = db.query(UserAlertConfig).filter(UserAlertConfig.id == config_id).first()
            
            if config and config.is_active:
                config.is_active = False
                db.commit()
                
                # Determine locale
                prefs = db.query(UserPreferences).filter(
                    UserPreferences.user_id == config.user_id
                ).first()
                locale = getattr(prefs, "locale", "es") if prefs else "es"
                
                answer = "✅ Alerta silenciada. Puedes reactivarla desde el Centro de Alertas." if locale == "es" \
                    else "✅ Alert muted. You can reactivate it from the Alerts Center."
                confirm = f"🔕 <i>{answer}</i>"
                await _send_message(bot_token, chat_id, confirm)
            else:
                answer = "ℹ️ Esta alerta ya estaba silenciada." if True else "ℹ️ This alert was already muted."
    except Exception as e:
        logger.error(f"Error handling mute callback: {e}")
        answer = "❌ Error al silenciar la alerta."
    
    # Answer the callback query (removes the loading spinner on the button)
    try:
        url = f"https://api.telegram.org/bot{bot_token}/answerCallbackQuery"
        async with httpx.AsyncClient() as client:
            await client.post(url, json={"callback_query_id": callback_id, "text": answer}, timeout=5.0)
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
            params = {"timeout": 30, "allowed_updates": ["message", "callback_query"]}
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

                    # ── CALLBACK QUERY (inline button clicks) ──
                    callback = update.get("callback_query")
                    if callback:
                        cb_data = callback.get("data", "")
                        cb_id = callback.get("id")
                        chat_id = str(callback.get("message", {}).get("chat", {}).get("id", ""))
                        
                        if cb_data.startswith("mute:"):
                            config_id = cb_data[5:]
                            await _handle_mute_callback(bot_token, cb_id, chat_id, config_id)
                        continue

                    # ── MESSAGE (commands) ──
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
                        response = _build_help_response(chat_id)
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
                                    locale = prefs.locale
                                    db.commit()
                                    
                                    # Custom Welcome Message
                                    from services.translations import get_text
                                    title = get_text(locale, "welcome_title")
                                    body = get_text(locale, "welcome_body")
                                    welcome_msg = f"{title}\n\n{body}"
                                    
                                    msg_id = await _send_message(bot_token, chat_id, welcome_msg)
                                    if msg_id:
                                        await _pin_message(bot_token, chat_id, msg_id)
                        else:
                            # User just clicked start without deep link
                            await _send_message(bot_token, chat_id, "⚠️ Para conectar tu cuenta de IronRisk, inicia el bot desde el enlace generado en el Centro de Alertas en la aplicación web.")
                    elif cmd.startswith("/a_") or cmd.startswith("/as_"):
                        is_silent = cmd.startswith("/as_")
                        prefix_len = 4 if is_silent else 3
                        lead_id = cmd[prefix_len:].replace("_", "-")
                        try:
                            from models.waitlist import WaitlistLead
                            from services.waitlist_service import execute_lead_approval
                            with SessionLocal() as db:
                                lead = db.query(WaitlistLead).filter(WaitlistLead.id == lead_id).first()
                                if not lead:
                                    await _send_message(bot_token, chat_id, "❌ Lead no encontrado.")
                                else:
                                    try:
                                        res = execute_lead_approval(db, lead, silent=is_silent)
                                        if res == "Already approved":
                                            await _send_message(bot_token, chat_id, f"⚠️ El lead {lead.email} ya estaba aprobado.")
                                        else:
                                            success_msg = f"✅ Lead {lead.email} aprobado con éxito.\nCuenta creada y correo enviado." \
                                                          if not is_silent else \
                                                          f"✅ Lead {lead.email} aprobado (SILENCIOSO).\nCuenta creada pero NO se ha enviado correo."
                                            await _send_message(bot_token, chat_id, success_msg)
                                            # Send copy-paste template for easy forwarding
                                            from services.waitlist_service import get_beta_invite_text
                                            invite_text = get_beta_invite_text(lead.locale or "es")
                                            await _send_message(bot_token, chat_id, f"📋 <b>Copia y reenvía esto al trader:</b>\n\n<code>{invite_text}</code>")
                                    except ValueError as e:
                                        await _send_message(bot_token, chat_id, f"❌ Error: {e}")
                        except Exception as e:
                            logger.error(f"Error approving from telegram: {e}")
                            await _send_message(bot_token, chat_id, "❌ Error interno al aprobar.")
                    # Unknown commands — silently ignore

        except httpx.ReadTimeout:
            # Normal for long polling — no updates received
            pass
        except Exception as e:
            logger.error(f"Bot poller error: {e}")
            await asyncio.sleep(5)

        # Small delay between poll cycles
        await asyncio.sleep(1)


async def _try_broadcast_once(bot_token: str):
    """Attempt to send the daily broadcast, but only if not already sent today.
    
    Uses a DB marker to prevent duplicates. The marker is set BEFORE sending
    to prevent the race condition where apt-daily-upgrade kills the process
    between broadcast and marker save (causing a duplicate on restart).
    """
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    try:
        with SessionLocal() as db:
            from models.system_settings import SystemSetting
            marker = db.query(SystemSetting).filter(SystemSetting.key == "last_daily_broadcast").first()
            if marker and marker.value == today_str:
                logger.info(f"Broadcast already sent today ({today_str}), skipping.")
                return
            # Mark BEFORE sending to prevent race condition
            if marker:
                marker.value = today_str
            else:
                db.add(SystemSetting(key="last_daily_broadcast", value=today_str, description="Date of last daily Telegram broadcast"))
            db.commit()
    except Exception as e:
        logger.error(f"Failed to check/set broadcast marker: {e}")
        return  # Don't broadcast if we can't guarantee idempotency

    logger.info(f"⏰ Executing Daily Telegram Broadcast for {today_str}")
    await _execute_broadcast(bot_token)


async def daily_status_broadcaster():
    """Background task that broadcasts the EA Status to all registered users daily at 06:00 UTC (08:00 CET).
    
    Resilient to service restarts: if the service starts between 06:00-06:30 UTC
    and the broadcast hasn't been sent yet today, it fires immediately.
    Uses a DB marker column to prevent duplicate broadcasts.
    """
    bot_token = await _get_bot_token()
    if not bot_token:
        logger.warning("TELEGRAM_BOT_TOKEN not set — daily broadcaster disabled.")
        return

    logger.info("🌅 Telegram Daily Broadcaster initialized.")

    while True:
        try:
            now = datetime.now(timezone.utc)
            target_hour = 6  # 06:00 UTC = 08:00 CET

            # Calculate next 06:00 UTC
            target = now.replace(hour=target_hour, minute=0, second=0, microsecond=0)
            if now >= target:
                target += timedelta(days=1)

            # Check if we need a catch-up broadcast (service restarted during window)
            in_catchup_window = now.hour == target_hour and now.minute < 30
            if in_catchup_window:
                await _try_broadcast_once(bot_token)

            sleep_seconds = (target - now).total_seconds()
            logger.info(f"Daily broadcaster sleeping for {sleep_seconds/3600:.2f} hours until {target.isoformat()}")
            await asyncio.sleep(sleep_seconds)

            # WAKING UP - It's 06:00 UTC!
            await _try_broadcast_once(bot_token)

        except asyncio.CancelledError:
            break
        except Exception as e:
            logger.error(f"Daily broadcaster error: {e}")
            await asyncio.sleep(60)


async def _execute_broadcast(bot_token: str):
    """Send the morning briefing to all users with Telegram linked."""
    with SessionLocal() as db:
        prefs = db.query(UserPreferences).filter(UserPreferences.telegram_chat_id.isnot(None)).all()
        for pref in prefs:
            chat_id = pref.telegram_chat_id
            if chat_id:
                status_msg = _build_status_response(chat_id)
                full_msg = f"🌅 <b>IRONRISK MORNING BRIEFING</b>\n\n{status_msg}"
                await _send_message(bot_token, chat_id, full_msg)
                await asyncio.sleep(0.5)
    logger.info(f"Daily broadcast complete. Sent to {len(prefs)} users.")

