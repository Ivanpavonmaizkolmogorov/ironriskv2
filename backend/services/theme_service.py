"""ThemeService — OOP service for user theme management.

Encapsulates all theme-related business logic: built-in theme catalogue,
user preference CRUD, and validation.
"""

from __future__ import annotations

from typing import Any

from fastapi import HTTPException
from sqlalchemy.orm import Session

from models.user_preferences import UserPreferences


class ThemeService:
    """Manages the built-in theme catalogue and per-user theme preferences."""

    # ── Built-in theme catalogue ────────────────────────────────────────
    # Each theme defines all CSS variables consumed by the frontend.
    # Keys must match the CSS variable names (without the -- prefix).

    BUILT_IN_THEMES: dict[str, dict[str, Any]] = {
        "iron_dark": {
            "label": "Iron Dark",
            "description": "The original dark theme — forged in steel.",
            "mode": "dark",
            "colors": {
                "surface-primary": "#0d0f12",
                "surface-secondary": "#161a1f",
                "surface-tertiary": "#1e2228",
                "surface-elevated": "#252a31",
                "iron-50": "#f6f7f8",
                "iron-100": "#e1e4e8",
                "iron-200": "#c3c9d1",
                "iron-300": "#9ea6b3",
                "iron-400": "#78828f",
                "iron-500": "#5d6774",
                "iron-600": "#4a5260",
                "iron-700": "#3e444f",
                "iron-800": "#363b44",
                "iron-900": "#30343b",
                "iron-950": "#1e2127",
                "risk-green": "#00e676",
                "risk-yellow": "#ffea00",
                "risk-red": "#ff1744",
                "accent": "#00e676",
                "accent-hover": "#00c853",
                "accent-muted": "rgba(0,230,118,0.15)",
                "scrollbar-track": "#161a1f",
                "scrollbar-thumb": "#3e444f",
                "scrollbar-thumb-hover": "#5d6774",
                "selection-bg": "rgba(0,230,118,0.2)",
                "selection-fg": "#00e676",
            },
        },
        "midnight_blue": {
            "label": "Midnight Blue",
            "description": "Deep ocean vibes — calm and focused.",
            "mode": "dark",
            "colors": {
                "surface-primary": "#0a0e1a",
                "surface-secondary": "#111827",
                "surface-tertiary": "#1a2234",
                "surface-elevated": "#223049",
                "iron-50": "#f0f4fa",
                "iron-100": "#dbe3f0",
                "iron-200": "#b8c6db",
                "iron-300": "#8ea3c4",
                "iron-400": "#6680a8",
                "iron-500": "#4d6590",
                "iron-600": "#3d5078",
                "iron-700": "#334163",
                "iron-800": "#2b3752",
                "iron-900": "#253047",
                "iron-950": "#172032",
                "risk-green": "#00e5ff",
                "risk-yellow": "#ffd740",
                "risk-red": "#ff5252",
                "accent": "#00bcd4",
                "accent-hover": "#0097a7",
                "accent-muted": "rgba(0,188,212,0.15)",
                "scrollbar-track": "#111827",
                "scrollbar-thumb": "#334163",
                "scrollbar-thumb-hover": "#4d6590",
                "selection-bg": "rgba(0,188,212,0.2)",
                "selection-fg": "#00bcd4",
            },
        },
        "blood_red": {
            "label": "Blood Red",
            "description": "Aggressive and bold — warrior mode.",
            "mode": "dark",
            "colors": {
                "surface-primary": "#0d0a0a",
                "surface-secondary": "#1a1212",
                "surface-tertiary": "#261a1a",
                "surface-elevated": "#332222",
                "iron-50": "#faf0f0",
                "iron-100": "#f0dede",
                "iron-200": "#dbbaba",
                "iron-300": "#c49090",
                "iron-400": "#a86868",
                "iron-500": "#905050",
                "iron-600": "#783e3e",
                "iron-700": "#633434",
                "iron-800": "#522b2b",
                "iron-900": "#472626",
                "iron-950": "#321818",
                "risk-green": "#ff9100",
                "risk-yellow": "#ffea00",
                "risk-red": "#ff1744",
                "accent": "#ff6b35",
                "accent-hover": "#e65100",
                "accent-muted": "rgba(255,107,53,0.15)",
                "scrollbar-track": "#1a1212",
                "scrollbar-thumb": "#633434",
                "scrollbar-thumb-hover": "#905050",
                "selection-bg": "rgba(255,107,53,0.2)",
                "selection-fg": "#ff6b35",
            },
        },
        "arctic_light": {
            "label": "Arctic Light",
            "description": "Clean and bright — ice-cold precision.",
            "mode": "light",
            "colors": {
                "surface-primary": "#f0f2f5",
                "surface-secondary": "#ffffff",
                "surface-tertiary": "#e8ebf0",
                "surface-elevated": "#dde1e8",
                "iron-50": "#1a1d23",
                "iron-100": "#2d3139",
                "iron-200": "#4a505c",
                "iron-300": "#636a78",
                "iron-400": "#7d8594",
                "iron-500": "#969eb0",
                "iron-600": "#aeb5c4",
                "iron-700": "#c5cbd6",
                "iron-800": "#d8dce5",
                "iron-900": "#e8ebf0",
                "iron-950": "#f5f6f8",
                "risk-green": "#2e7d32",
                "risk-yellow": "#f9a825",
                "risk-red": "#c62828",
                "accent": "#1976d2",
                "accent-hover": "#1565c0",
                "accent-muted": "rgba(25,118,210,0.12)",
                "scrollbar-track": "#e8ebf0",
                "scrollbar-thumb": "#c5cbd6",
                "scrollbar-thumb-hover": "#969eb0",
                "selection-bg": "rgba(25,118,210,0.15)",
                "selection-fg": "#1976d2",
            },
        },
    }

    # ── Public API ──────────────────────────────────────────────────────

    @classmethod
    def list_themes(cls, db: Session = None, user_id: str = None) -> dict[str, dict[str, Any]]:
        """Return the full catalogue of themes (built-in + user custom)."""
        themes = cls.BUILT_IN_THEMES.copy()
        
        if db and user_id:
            from models.user_theme import UserTheme
            user_themes = db.query(UserTheme).filter(UserTheme.user_id == user_id).all()
            for t in user_themes:
                themes[t.id] = {
                    "label": f"Custom: {t.label}",
                    "description": "User created theme",
                    "mode": t.mode,
                    "colors": t.colors,
                    "is_custom": True
                }
                
        return themes

    @classmethod
    def get_theme(cls, theme_name: str, db: Session = None, user_id: str = None) -> dict[str, Any]:
        """Return a single theme definition. Raises 404 if not found."""
        themes = cls.list_themes(db, user_id)
        theme = themes.get(theme_name)
        if not theme:
            raise HTTPException(status_code=404, detail=f"Theme '{theme_name}' not found")
        return theme

    @classmethod
    def validate_theme_name(cls, name: str, db: Session = None, user_id: str = None) -> None:
        """Raise 400 if *name* is not a known theme."""
        themes = cls.list_themes(db, user_id)
        if name not in themes:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid theme '{name}'.",
            )

    # ── Preference CRUD ─────────────────────────────────────────────────

    @staticmethod
    def get_or_create(db: Session, user_id: str) -> UserPreferences:
        """Return existing preferences or create default ones."""
        prefs = (
            db.query(UserPreferences)
            .filter(UserPreferences.user_id == user_id)
            .first()
        )
        if not prefs:
            prefs = UserPreferences(user_id=user_id, theme="iron_dark")
            db.add(prefs)
            db.commit()
            db.refresh(prefs)
        return prefs

    @classmethod
    def update_theme(cls, db: Session, user_id: str, theme_name: str) -> UserPreferences:
        """Validate and persist a new active theme for the user."""
        cls.validate_theme_name(theme_name, db, user_id)
        prefs = cls.get_or_create(db, user_id)
        prefs.theme = theme_name
        db.commit()
        db.refresh(prefs)
        return prefs

    # ── Custom Theme CRUD ─────────────────────────────────────────────────

    @classmethod
    def create_custom_theme(cls, db: Session, user_id: str, label: str, mode: str, colors: dict) -> dict:
        import uuid
        from models.user_theme import UserTheme
        
        theme_id = f"custom_{uuid.uuid4().hex[:8]}"
        new_theme = UserTheme(
            id=theme_id,
            user_id=user_id,
            label=label,
            mode=mode,
            colors=colors
        )
        db.add(new_theme)
        db.commit()
        return {"id": theme_id, "message": "Custom theme created successfully"}

    @classmethod
    def update_custom_theme(cls, db: Session, user_id: str, theme_id: str, label: str, mode: str, colors: dict) -> dict:
        from models.user_theme import UserTheme
        theme = db.query(UserTheme).filter(UserTheme.id == theme_id, UserTheme.user_id == user_id).first()
        if not theme:
            raise HTTPException(status_code=404, detail="Custom theme not found")
            
        theme.label = label
        theme.mode = mode
        theme.colors = colors
        
        db.commit()
        return {"id": theme_id, "message": "Custom theme updated successfully"}

    @classmethod
    def delete_custom_theme(cls, db: Session, user_id: str, theme_id: str) -> dict:
        from models.user_theme import UserTheme
        
        theme = db.query(UserTheme).filter(UserTheme.id == theme_id, UserTheme.user_id == user_id).first()
        if not theme:
            raise HTTPException(status_code=404, detail="Custom theme not found")
            
        db.delete(theme)
        
        # Reset any user references that were using this theme to default
        prefs = db.query(UserPreferences).filter(UserPreferences.user_id == user_id, UserPreferences.theme == theme_id).first()
        if prefs:
            prefs.theme = "iron_dark"
            
        from models.trading_account import TradingAccount
        db.query(TradingAccount).filter(TradingAccount.user_id == user_id, TradingAccount.theme == theme_id).update(
            {"theme": None}, synchronize_session=False
        )
            
        db.commit()
        return {"message": "Custom theme deleted successfully"}
