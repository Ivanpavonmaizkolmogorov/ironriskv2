"""Telegram Integration API — Synchronizes Telegram Chat IDs via getUpdates (Long Polling style lookup)."""

import uuid
import httpx
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException

from sqlalchemy.orm import Session
from sqlalchemy import select

from models.database import get_db, get_settings
from models.user import User
from models.user_preferences import UserPreferences
from services.auth_service import get_current_user

router = APIRouter(prefix="/api/telegram", tags=["Telegram Integration"])
logger = logging.getLogger("ironrisk.telegram")

from pydantic import BaseModel
from services.translations import get_text

class GenerateLinkRequest(BaseModel):
    locale: str = "es"

@router.post("/generate-link")
async def generate_telegram_link(
    req: GenerateLinkRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Generates a unique Telegram Deep Link payload token for the user.
    """
    settings = get_settings()
    # The bot username should ideally be in env, or hardcoded for now 
    # since the user created @IronRiskShield_bot
    bot_username = "IronRiskShield_bot"
    
    prefs = db.query(UserPreferences).filter(UserPreferences.user_id == current_user.id).first()
    if not prefs:
        prefs = UserPreferences(user_id=current_user.id)
        db.add(prefs)
    
    # Generate a fresh 6-character alphanumeric token
    sync_token = str(uuid.uuid4())[:8]
    prefs.telegram_sync_token = sync_token
    prefs.locale = req.locale
    db.commit()

    link = f"https://t.me/{bot_username}?start={sync_token}"
    return {"link": link, "token": sync_token}


@router.post("/verify-link")
async def verify_telegram_link(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Checks Telegram's getUpdates endpoints to see if the user has tapped Start on our Bot
    with their unique sync_token.
    This avoids needing Webhooks and public SSL IPs for development!
    """
    settings = get_settings()
    bot_token = getattr(settings, "TELEGRAM_BOT_TOKEN", None)
    if not bot_token:
        raise HTTPException(status_code=500, detail="El TELEGRAM_BOT_TOKEN no está configurado en el servidor (.env)")

    prefs = db.query(UserPreferences).filter(UserPreferences.user_id == current_user.id).first()
    if prefs and not prefs.telegram_sync_token and prefs.telegram_chat_id:
        return {"status": "linked", "chat_id": prefs.telegram_chat_id}

    if not prefs or not prefs.telegram_sync_token:
         raise HTTPException(status_code=400, detail="No se ha generado ningún token de sincronización")
    
    # Let the background 'telegram_bot_poller' handle all getUpdates, 
    # to avoid race conditions. We just check if the DB sync token got consumed.
    return {"status": "pending"}
@router.get("/status")
def get_telegram_status(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    prefs = db.query(UserPreferences).filter(UserPreferences.user_id == current_user.id).first()
    return {
        "is_linked": bool(prefs and prefs.telegram_chat_id),
        "chat_id": prefs.telegram_chat_id if prefs else None
    }

@router.delete("/link")
def unlink_telegram(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    prefs = db.query(UserPreferences).filter(UserPreferences.user_id == current_user.id).first()
    if prefs and prefs.telegram_chat_id:
        prefs.telegram_chat_id = None
        db.commit()
    return {"status": "unlinked"}
