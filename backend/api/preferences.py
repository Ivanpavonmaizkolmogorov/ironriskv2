"""User Preferences API — theme management and locale endpoints."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from models.database import get_db
from models.user import User
from schemas.preferences import (
    UpdateThemeRequest,
    PreferencesResponse,
    ThemeCatalogueResponse,
    CreateUserThemeRequest
)
from services.auth_service import get_current_user
from services.theme_service import ThemeService

router = APIRouter(prefix="/api/user", tags=["User Preferences"])


@router.get("/preferences", response_model=PreferencesResponse)
def get_preferences(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Return the current user's preferences (theme, etc.)."""
    prefs = ThemeService.get_or_create(db, user.id)
    theme_data = ThemeService.get_theme(prefs.theme, db, user.id)
    return PreferencesResponse(theme=prefs.theme, theme_data=theme_data)


@router.patch("/preferences/theme", response_model=PreferencesResponse)
def update_theme(
    body: UpdateThemeRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Change the user's active theme."""
    prefs = ThemeService.update_theme(db, user.id, body.theme)
    
    if body.apply_to_all_workspaces:
        from models.trading_account import TradingAccount
        db.query(TradingAccount).filter(TradingAccount.user_id == user.id).update(
            {"theme": None}, synchronize_session=False
        )
        db.commit()

    theme_data = ThemeService.get_theme(prefs.theme, db, user.id)
    return PreferencesResponse(theme=prefs.theme, theme_data=theme_data)


from pydantic import BaseModel

class UpdateLocaleRequest(BaseModel):
    locale: str  # "es" or "en"

@router.patch("/preferences/locale")
def update_locale(
    body: UpdateLocaleRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Sync the user's UI language to backend for Telegram notifications."""
    prefs = ThemeService.get_or_create(db, user.id)
    valid = ["es", "en"]
    if body.locale in valid:
        prefs.locale = body.locale
        db.commit()
    return {"locale": prefs.locale}


from fastapi import Request

@router.get("/themes", response_model=ThemeCatalogueResponse)
def list_themes(
    request: Request,
    db: Session = Depends(get_db),
):
    """Return all available themes (built-in + user custom if authenticated)."""
    user_id = None
    auth = request.headers.get("Authorization")
    if auth and auth.startswith("Bearer "):
        token = auth.split(" ")[1]
        try:
            from services.auth_service import decode_jwt
            payload = decode_jwt(token)
            user_id = payload.get("sub")
        except Exception:
            pass
            
    return ThemeCatalogueResponse(themes=ThemeService.list_themes(db, user_id))


@router.post("/themes/custom")
def create_custom_theme(
    body: CreateUserThemeRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Save a user-defined custom theme."""
    return ThemeService.create_custom_theme(db, user.id, body.label, body.mode, body.colors)


@router.put("/themes/custom/{theme_id}")
def update_custom_theme(
    theme_id: str,
    body: CreateUserThemeRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update an existing user-defined custom theme."""
    return ThemeService.update_custom_theme(db, user.id, theme_id, body.label, body.mode, body.colors)


@router.delete("/themes/custom/{theme_id}")
def delete_custom_theme(
    theme_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete a user-defined custom theme."""
    return ThemeService.delete_custom_theme(db, user.id, theme_id)
