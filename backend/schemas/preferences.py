"""Pydantic schemas for user preferences (theme system)."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel


class UpdateThemeRequest(BaseModel):
    """Body for PATCH /api/user/preferences/theme."""
    theme: str
    apply_to_all_workspaces: bool = False


class PreferencesResponse(BaseModel):
    """Response for GET /api/user/preferences."""
    theme: str
    theme_data: Any

    class Config:
        from_attributes = True


class CreateUserThemeRequest(BaseModel):
    """Body for POST /api/user/themes/custom."""
    label: str
    mode: str
    colors: dict[str, str]


class ThemeCatalogueEntry(BaseModel):
    """A single theme in the catalogue listing."""
    label: str
    description: str
    mode: str
    colors: dict[str, str]
    is_custom: bool = False


class ThemeCatalogueResponse(BaseModel):
    """Response for GET /api/themes."""
    themes: dict[str, ThemeCatalogueEntry]
