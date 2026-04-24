import abc
import logging
import httpx

logger = logging.getLogger("ironrisk.notifications")

class NotificationChannel(abc.ABC):
    """Abstract base class for notification channels."""

    @abc.abstractmethod
    async def send(self, recipient_id: str, message: str) -> bool:
        """
        Sends a message to the recipient.
        recipient_id: Channel-specific identifier (e.g. Telegram chat ID, email address).
        message: The text of the alert.
        Returns True on success, False otherwise.
        """
        pass


class TelegramChannel(NotificationChannel):
    """Sends messages via Telegram Bot API."""

    def __init__(self, bot_token: str):
        self.bot_token = bot_token
        # Telegram API URL base: https://api.telegram.org/bot<TOKEN>/sendMessage

    async def send(self, recipient_id: str, message: str, reply_markup: dict | None = None) -> bool:
        if not self.bot_token or not recipient_id:
            logger.error(f"Cannot send Telegram message: Missing token or recipient_id={recipient_id}")
            return False

        url = f"https://api.telegram.org/bot{self.bot_token}/sendMessage"
        payload = {
            "chat_id": recipient_id,
            "text": message,
            "parse_mode": "HTML"
        }
        if reply_markup:
            payload["reply_markup"] = reply_markup

        try:
            async with httpx.AsyncClient() as client:
                resp = await client.post(url, json=payload, timeout=10.0)
                if resp.status_code == 200:
                    return True
                else:
                    logger.error(f"Telegram API error {resp.status_code}: {resp.text}")
                    return False
        except Exception as e:
            logger.error(f"Failed to send Telegram message: {e}")
            return False

class EmailChannel(NotificationChannel):
    """Placeholder for Email integration."""
    async def send(self, recipient_id: str, message: str) -> bool:
        logger.info(f"Mock Email sent to {recipient_id}: {message}")
        return True
