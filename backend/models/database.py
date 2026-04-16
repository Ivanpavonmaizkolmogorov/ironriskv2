"""Database configuration and session management."""

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from functools import lru_cache
from pydantic_settings import BaseSettings
import os


class Settings(BaseSettings):
    """App settings loaded from environment variables."""

    DATABASE_URL: str = "sqlite:///" + os.path.join(os.path.dirname(os.path.dirname(__file__)), "ironrisk.db")
    JWT_SECRET_KEY: str = "dev-secret-change-me"
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRATION_MINUTES: int = 1440
    CORS_ORIGINS: str = "http://localhost:3000"
    SMTP_EMAIL: str | None = None
    SMTP_PASSWORD: str | None = None
    TELEGRAM_BOT_TOKEN: str | None = None
    ADMIN_TELEGRAM_CHAT_ID: str | None = None
    BETA_ACCESS_CODE: str | None = None

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    return Settings()


class Base(DeclarativeBase):
    """SQLAlchemy declarative base for all models."""
    pass


# Engine and session — created on first import
_settings = get_settings()

# SQLite needs check_same_thread=False for FastAPI's async workers
_connect_args = {}
if _settings.DATABASE_URL.startswith("sqlite"):
    _connect_args["check_same_thread"] = False

engine = create_engine(_settings.DATABASE_URL, echo=False, connect_args=_connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    """FastAPI dependency — yields a DB session per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
