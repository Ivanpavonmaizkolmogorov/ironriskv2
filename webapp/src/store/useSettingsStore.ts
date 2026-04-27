import { create } from 'zustand';
import { settingsAPI } from '@/services/api';

/**
 * SINGLE SOURCE OF TRUTH: webapp/src/config/onboarding.json
 * Tutorial URLs are imported directly from the JSON — no API, no DB.
 * Only admin_telegram_handle is fetched from the API (it could change at runtime).
 */
import onboarding from '@/config/onboarding.json';

interface SettingsState {
  adminTelegramHandle: string;
  tutorialUrlEn: string;
  tutorialUrlEs: string;
  isLoaded: boolean;
  fetchSettings: () => Promise<void>;
  getTutorialUrl: (locale: string) => string;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  adminTelegramHandle: onboarding.admin_telegram_handle,
  tutorialUrlEn: onboarding.tutorial_url_en,
  tutorialUrlEs: onboarding.tutorial_url_es,
  isLoaded: false,
  getTutorialUrl: (locale: string) => {
    return locale === 'en' ? get().tutorialUrlEn : get().tutorialUrlEs;
  },
  fetchSettings: async () => {
    if (get().isLoaded) return;
    try {
      const res = await settingsAPI.getPublic();
      const settings = res.data.settings;
      
      const adminAlias = settings.find((s: any) => s.key === 'admin_telegram_handle');
      
      set({ 
        adminTelegramHandle: adminAlias ? adminAlias.value : onboarding.admin_telegram_handle,
        // Tutorial URLs ALWAYS come from onboarding.json — never from API
        isLoaded: true 
      });
    } catch (e) {
      console.error('Failed to fetch public settings', e);
      set({ isLoaded: true });
    }
  }
}));
