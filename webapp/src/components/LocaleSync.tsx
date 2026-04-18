"use client";

import { useEffect } from "react";
import { useLocale } from "next-intl";

/**
 * Invisible component that syncs the URL locale (from next-intl routing)
 * to the backend database every time the locale changes.
 * 
 * This is the ONLY reliable way to persist locale because:
 * 1. The button click in UserProfileDropdown triggers router.replace() which
 *    causes a soft navigation — any pending fetch() may be aborted.
 * 2. Service workers and ad-blockers can intercept/block API calls.
 * 3. By syncing AFTER the page has rendered with the new locale, we guarantee
 *    the fetch runs in a stable page context with no navigation interrupts.
 */
export default function LocaleSync() {
  const locale = useLocale();

  useEffect(() => {
    const jwt = typeof window !== "undefined" ? localStorage.getItem("ironrisk_jwt") : null;
    if (!jwt) return; // Not logged in, nothing to sync

    const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.ironrisk.pro";
    // Ensure HTTPS
    const baseURL = typeof window !== "undefined" && window.location.protocol === "https:"
      ? API_URL.replace("http://", "https://")
      : API_URL;

    // Fire-and-forget sync — if it fails, it will retry on next page load
    fetch(`${baseURL}/api/user/profile/i18n`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${jwt}`,
      },
      body: JSON.stringify({ locale }),
    }).catch(() => {
      // Silent fail — will retry next navigation
    });
  }, [locale]); // Re-runs whenever the locale in the URL changes

  return null; // Invisible component
}
