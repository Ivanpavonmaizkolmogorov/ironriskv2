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

        # We will need the user preferences if we fire an alert to know their Chat ID/Email
        prefs = self.db.execute(select(UserPreferences).where(UserPreferences.user_id == user_id)).scalar_one_or_none()
        
        now = datetime.now(timezone.utc)

        for config in configs:
            # Check if the required metric is present in the snapshot
            if config.metric_key not in metrics_snapshot:
                continue
            
            current_value = float(metrics_snapshot[config.metric_key])

            # Check if threshold breached
            with open("alert_debug.log", "a", encoding="utf-8") as f: f.write(f"Evaluating {config.metric_key}: {current_value} vs {config.threshold_value} (op: {config.operator})\n")
            if self._evaluate_condition(config.operator, current_value, config.threshold_value):
                # Trigger Condition Met! Check Anti-Spam (Cooldown)
                with open("alert_debug.log", "a", encoding="utf-8") as f: f.write(f"-> Condition met! Checking cooldown lock...\n")
                
                # Prevent duplicate dispatches from concurrent Metatrader heartbeats
                config_lock = _get_alert_lock(config.id)
                with config_lock:
                    # Fetch last trigger history
                    last_hist_stmt = select(UserAlertHistory).where(
                        UserAlertHistory.config_id == config.id
                    ).order_by(UserAlertHistory.triggered_at.desc()).limit(1)
                    
                    last_hist = self.db.execute(last_hist_stmt).scalar_one_or_none()
                    
                    
                    if last_hist:
                        triggered_at = last_hist.triggered_at
                        if triggered_at.tzinfo is None:
                            triggered_at = triggered_at.replace(tzinfo=timezone.utc)
                            
                        elapsed = (now - triggered_at).total_seconds() / 60.0
                        with open("alert_debug.log", "a", encoding="utf-8") as f: f.write(f"-> Last hist found. Elapsed: {elapsed} mins. Cooldown: {config.cooldown_minutes}\n")
                        
                        if config.cooldown_minutes == 0:
                            with open("alert_debug.log", "a", encoding="utf-8") as f: f.write(f"-> Aborted: Cooldown is 0 (1-time alert).\n")
                            continue # Fire once and never again
                            
                        if elapsed < config.cooldown_minutes:
                            with open("alert_debug.log", "a", encoding="utf-8") as f: f.write(f"-> Aborted: Still in cooldown period.\n")
                            continue # Still in cooldown period
                    else:
                        with open("alert_debug.log", "a", encoding="utf-8") as f: f.write(f"-> No previous history found.\n")

                    with open("alert_debug.log", "a", encoding="utf-8") as f: f.write(f"-> We can fire the alert!\n")
                    # We can fire the alert!
                    locale = prefs.locale if prefs else "es"
                    
                    # Handling custom EA disconnect alert message
                    if config.metric_key == "ea_disconnect_minutes":
                        title = get_text(locale, "alert_title_ea_disconnect")
                        body = get_text(locale, "alert_body_ea_disconnect", minutes=int(current_value))
                        message = f"{title}\n\n{body}"
                    else:
                        # Generic Threshold breached template
                        title = get_text(locale, "alert_title_risk", target_type_upper=target_type.upper())
                        metric_line = get_text(locale, "alert_metric_line", metric_key=config.metric_key, operator=config.operator, threshold_value=config.threshold_value)
                        value_line = get_text(locale, "alert_value_line", current_value=current_value)
                        
                        message = f"{title}\n\n{metric_line}\n{value_line}"
                        
                    if target_id:
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
