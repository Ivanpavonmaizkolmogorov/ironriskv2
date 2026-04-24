"""
Single source of truth for onboarding tutorial URLs.
Update ONLY these constants when uploading new tutorial videos.

These must stay in sync with: webapp/src/config/tutorials.ts
"""

TUTORIAL_URL_EN = "https://youtu.be/IgGUemRjnoc"
TUTORIAL_URL_ES = "https://youtu.be/rW_rJLNmtTw"


def get_tutorial_url(locale: str) -> str:
    """Returns the correct tutorial URL for a given locale."""
    return TUTORIAL_URL_EN if locale == "en" else TUTORIAL_URL_ES
