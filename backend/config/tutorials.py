"""
SINGLE SOURCE OF TRUTH for onboarding tutorial URLs.
Update ONLY these constants when uploading new tutorial videos.

The frontend reads these values via the public Settings API at runtime.
Backend services (email_service, waitlist_service) import directly from here.
"""

TUTORIAL_URL_EN = "https://youtu.be/IgGUemRjnoc"
TUTORIAL_URL_ES = "https://www.youtube.com/playlist?list=PL2-Vp4inhJRLXEbMuJ2m--H3F72x9V7Pw"


def get_tutorial_url(locale: str) -> str:
    """Returns the correct tutorial URL for a given locale."""
    return TUTORIAL_URL_EN if locale == "en" else TUTORIAL_URL_ES
