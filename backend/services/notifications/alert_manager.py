import logging
import threading
from datetime import datetime, timezone, timedelta
from typing import Dict, Any

from sqlalchemy.orm import Session
from sqlalchemy import select

from models.database import get_settings
from models.user_alerts import UserAlertConfig, UserAlertHistory
from models.user_preferences import UserPreferences
from .channels import NotificationChannel, TelegramChannel, EmailChannel
from services.translations import get_text

logger = logging.getLogger("ironrisk.alert_engine")

_alert_locks: dict[str, threading.Lock] = {}
_alert_locks_mutex = threading.Lock()

def _get_alert_lock(config_id: str) -> threading.Lock:
    with _alert_locks_mutex:
        if config_id not in _alert_locks:
            _alert_locks[config_id] = threading.Lock()
        return _alert_locks[config_id]

class AlertEngine:
    """Core engine evaluating live metrics against the user's Ulysses Pact (UserAlertConfigs)."""

    def __init__(self, db: Session):
        self.db = db
        settings = get_settings()
        
        # Instantiate available channels
        bot_token = getattr(settings, "TELEGRAM_BOT_TOKEN", None)
        self.channels: dict[str, NotificationChannel] = {
            "telegram": TelegramChannel(bot_token),
            "email": EmailChannel()
        }

    def _evaluate_condition(self, operator: str, current_value: float, threshold: float) -> bool:
        if operator == ">": return current_value > threshold
        if operator == "<": return current_value < threshold
        if operator == ">=": return current_value >= threshold
        if operator == "<=": return current_value <= threshold
        if operator == "==": return current_value == threshold
        return False

    async def evaluate_metrics(self, user_id: str, target_type: str, target_id: str | None, metrics_snapshot: Dict[str, Any]):
        """
        evaluates a set of live metrics against user-defined thresholds.
        metrics_snapshot: keys like "max_drawdown", "consec_losses", "ea_disconnect", etc.
        """
        # Fetch active configs for this target
        stmt = select(UserAlertConfig).where(
            UserAlertConfig.user_id == user_id,
            UserAlertConfig.target_type == target_type,
            UserAlertConfig.target_id == target_id,
            UserAlertConfig.is_active == True
        )
        configs = self.db.scalars(stmt).all()

        if not configs:
            return # No rules defined

        # ── INTERCEPT SYSTEM ALERTS ──
        prefs = self.db.execute(select(UserPreferences).where(UserPreferences.user_id == user_id)).scalar_one_or_none()
        locale = prefs.locale if prefs else "es"
        channel_id = prefs.telegram_chat_id if prefs else None
        now = datetime.now(timezone.utc)
        
        if "duplicate_installation" in metrics_snapshot and metrics_snapshot["duplicate_installation"] == 1:
            if channel_id and "telegram" in self.channels:
                host_a = metrics_snapshot.get("host_a", "N/A")
                host_b = metrics_snapshot.get("host_b", "N/A")
                if locale == "en":
                    msg = f"🚨 <b>DUPLICATE INSTALLATION DETECTED</b>\n\n⚠️ Node is being accessed from multiple machines simultaneously:\n  • <b>{host_a}</b>\n  • <b>{host_b}</b>\n\nFor safety, keep the Service active on a single computer only."
                else:
                    msg = f"🚨 <b>INSTALACIÓN DUPLICADA DETECTADA</b>\n\n⚠️ El nodo está siendo accedido desde múltiples máquinas simultáneamente:\n  • <b>{host_a}</b>\n  • <b>{host_b}</b>\n\nPor seguridad, mantén el Servicio activo en un solo ordenador."
                await self.channels["telegram"].send(channel_id, msg)
            return

        if "transition_alert" in metrics_snapshot:
            if channel_id and "telegram" in self.channels:
                await self.channels["telegram"].send(channel_id, metrics_snapshot["transitionalert_text"])
            return

        # ── USER DEFINED ALERTS (PACTO DE ULISES) ──
        for config in configs:
            if config.metric_key not in metrics_snapshot:
                continue
            
            current_value = float(metrics_snapshot[config.metric_key])

            is_breached = self._evaluate_condition(config.operator, current_value, config.threshold_value)
            
            config_lock = _get_alert_lock(config.id)
            with config_lock:
                # Fetch last trigger history
                last_hist_stmt = select(UserAlertHistory).where(
                    UserAlertHistory.config_id == config.id
                ).order_by(UserAlertHistory.triggered_at.desc()).limit(1)
                
                last_hist = self.db.execute(last_hist_stmt).scalar_one_or_none()
                
                # INCIDENT RECOVERY (Auto-Rearm)
                # If the metric is no longer breached, and there is an existing lock (history), clear it!
                if not is_breached:
                    if last_hist:
                        self.db.delete(last_hist)
                        self.db.commit()
                        with open("alert_debug.log", "a", encoding="utf-8") as f: f.write(f"-> Incident resolved for {config.metric_key}, history cleared.\n")
                    continue
                
                # Trigger Condition Met! Check Anti-Spam (Cooldown)
                with open("alert_debug.log", "a", encoding="utf-8") as f: f.write(f"-> Condition met! Checking cooldown lock...\n")
                
                if last_hist:
                    triggered_at = last_hist.triggered_at
                    if triggered_at.tzinfo is None:
                        triggered_at = triggered_at.replace(tzinfo=timezone.utc)
                        
                    elapsed = (now - triggered_at).total_seconds() / 60.0
                    
                    if config.cooldown_minutes == 0:
                        continue # Fire once per incident. If we are here, the incident hasn't been cleared yet.
                        
                    if elapsed < config.cooldown_minutes:
                        continue # Still in cooldown period
                        
                # We can fire the alert!
                
                # Handling custom EA disconnect alert message
                skip_target_footer = False
                if config.metric_key == "ea_disconnect_minutes":
                    workspace_name = metrics_snapshot.get("disconnected_workspace", "Unknown")
                    title = get_text(locale, "alert_title_ea_disconnect")
                    body = get_text(locale, "alert_body_ea_disconnect", minutes=int(current_value), workspace=workspace_name)
                    message = f"{title}\n\n{body}"
                    skip_target_footer = True  # The workspace name is already in the message
                else:
                    # Generic Threshold breached template
                    title = get_text(locale, "alert_title_risk", target_type_upper=target_type.upper())
                    
                    safe_operator = config.operator.replace("<", "&lt;").replace(">", "&gt;")
                    metric_line = get_text(locale, "alert_metric_line", metric_key=config.metric_key, operator=safe_operator, threshold_value=config.threshold_value)
                    value_line = get_text(locale, "alert_value_line", current_value=current_value)
                    
                    message = f"{title}\n\n{metric_line}\n{value_line}"
                    
                if target_id and not skip_target_footer:
                    try:
                        target_name = "Desconocido"
                        account_name = "N/A"
                        from models.trading_account import TradingAccount
                        
                        if target_type == "strategy":
                            from models.strategy import Strategy
                            strat = self.db.query(Strategy).filter(Strategy.id == target_id).first()
                            if strat:
                                target_name = strat.name
                                acc = self.db.query(TradingAccount).filter(TradingAccount.id == strat.trading_account_id).first()
                                if acc: account_name = acc.name or acc.broker or acc.id[:6]
                        elif target_type == "portfolio":
                            from models.portfolio import Portfolio
                            port = self.db.query(Portfolio).filter(Portfolio.id == target_id).first()
                            if port:
                                target_name = port.name
                                acc = self.db.query(TradingAccount).filter(TradingAccount.id == port.trading_account_id).first()
                                if acc: account_name = acc.name or acc.broker or acc.id[:6]
                        elif target_type == "account":
                            acc = self.db.query(TradingAccount).filter(TradingAccount.id == target_id).first()
                            if acc:
                                target_name = "Nivel de Cuenta"
                                account_name = acc.name or acc.broker or acc.id[:6]
                                
                        id_line = get_text(locale, "alert_id_line", target_name=target_name, account_name=account_name)
                        message += f"\n\n{id_line}"
                    except Exception as e:
                        with open("alert_debug.log", "a", encoding="utf-8") as f: f.write(f"-> EXCEPTION building message: {e}\n")

                # Send via selected channel
                channel = self.channels.get(config.channel)
                if not channel:
                    logger.error(f"Alert configuration uses unknown channel: {config.channel}")
                    continue
                
                # Resolve recipient
                recipient = None
                if config.channel == "telegram" and prefs and prefs.telegram_chat_id:
                    recipient = prefs.telegram_chat_id
                elif config.channel == "email":
                    # Assume user email is tied to preferences via relationships or we'd fetch the user
                    recipient = getattr(prefs.user, "email", "unknown@email.com") if prefs else None
                
                if not recipient:
                    logger.warning(f"Could not resolve recipient ID for user {user_id} on channel {config.channel}")
                    continue

                with open("alert_debug.log", "a", encoding="utf-8") as f: f.write(f"-> Sending message via {config.channel} to {recipient}\n")
                # Fire and forget
                success = await channel.send(recipient, message)
                with open("alert_debug.log", "a", encoding="utf-8") as f: f.write(f"-> Send success: {success}\n")


                # Append history
                if success:
                    history_entry = UserAlertHistory(
                        user_id=user_id,
                        config_id=config.id,
                        triggered_at=now,
                        value_at_trigger=current_value,
                        message_sent=message
                    )
                    self.db.add(history_entry)
                    self.db.commit()
