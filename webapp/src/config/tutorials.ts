/**
 * Single source of truth for onboarding tutorial URLs.
 * Update ONLY these constants when uploading new tutorial videos.
 *
 * These must stay in sync with: backend/config/tutorials.py
 */

export const TUTORIAL_URL_EN = "https://youtu.be/IgGUemRjnoc";
export const TUTORIAL_URL_ES = "https://youtu.be/rW_rJLNmtTw";

/** Helper: returns the correct tutorial URL for a given locale. */
export function getTutorialUrl(locale: string): string {
  return locale === "en" ? TUTORIAL_URL_EN : TUTORIAL_URL_ES;
}
