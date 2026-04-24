from sqlalchemy.orm import Session
from models.system_setting import SystemSetting
from schemas.system_setting import SystemSettingUpdate

class SettingsService:
    """Service to handle dynamic system settings."""

    @staticmethod
    def get_setting(db: Session, key: str) -> SystemSetting | None:
        return db.query(SystemSetting).filter(SystemSetting.key == key).first()

    @staticmethod
    def get_setting_value(db: Session, key: str, default: str = "") -> str:
        setting = SettingsService.get_setting(db, key)
        if setting:
            return setting.value
        return default

    @staticmethod
    def get_public_settings(db: Session) -> list[SystemSetting]:
        # Defined set of keys that are safe to expose to the frontend without auth
        PUBLIC_KEYS = ["admin_telegram_handle", "tutorial_url_en", "tutorial_url_es"]
        return db.query(SystemSetting).filter(SystemSetting.key.in_(PUBLIC_KEYS)).all()

    @staticmethod
    def set_setting(db: Session, key: str, value: str, description: str = None) -> SystemSetting:
        setting = db.query(SystemSetting).filter(SystemSetting.key == key).first()
        if setting:
            setting.value = value
            if description is not None:
                setting.description = description
        else:
            setting = SystemSetting(key=key, value=value, description=description)
            db.add(setting)
        db.commit()
        db.refresh(setting)
        return setting

def init_default_settings(db: Session):
    """Seed default settings if they don't exist."""
    from config.tutorials import TUTORIAL_URL_EN, TUTORIAL_URL_ES
    defaults = {
        "admin_telegram_handle": ("@IronRisk_Ivan", "Soporte Telegram alias shown to users"),
        "tutorial_url_en": (TUTORIAL_URL_EN, "YouTube tutorial URL for English users"),
        "tutorial_url_es": (TUTORIAL_URL_ES, "YouTube tutorial URL for Spanish users"),
    }
    for key, (val, desc) in defaults.items():
        if not SettingsService.get_setting(db, key):
            SettingsService.set_setting(db, key, val, desc)
