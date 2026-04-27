"""
SINGLE SOURCE OF TRUTH for onboarding tutorial URLs.

Reads from /config/onboarding.json at the repository root.
Both this Python module and the Next.js frontend import from the same JSON.
"""

import json
import os

_CONFIG_PATH = os.path.join(os.path.dirname(__file__), "..", "..", "webapp", "src", "config", "onboarding.json")

def _load() -> dict:
    """Load the shared onboarding config JSON."""
    try:
        with open(_CONFIG_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError:
        # Fallback for production server (flat deploy without webapp/)
        alt = os.path.join(os.path.dirname(__file__), "onboarding.json")
        try:
            with open(alt, "r", encoding="utf-8") as f:
                return json.load(f)
        except FileNotFoundError:
            return {}

_config = _load()

TUTORIAL_URL_EN = _config.get("tutorial_url_en", "https://youtu.be/IgGUemRjnoc")
TUTORIAL_URL_ES = _config.get("tutorial_url_es", "https://www.youtube.com/playlist?list=PL2-Vp4inhJRLXEbMuJ2m--H3F72x9V7Pw")
ADMIN_TELEGRAM_HANDLE = _config.get("admin_telegram_handle", "@IronRisk_Ivan")


def get_tutorial_url(locale: str) -> str:
    """Returns the correct tutorial URL for a given locale."""
    return TUTORIAL_URL_EN if locale == "en" else TUTORIAL_URL_ES
