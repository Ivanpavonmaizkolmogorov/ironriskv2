import { create } from 'zustand';
import { settingsAPI } from '@/services/api';

/**
 * SINGLE SOURCE OF TRUTH: config/onboarding.json (repo root).
 * Both this frontend store and the Python backend read from the same JSON.
 * The import below is resolved at build time by Next.js.
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
      const ytEn = settings.find((s: any) => s.key === 'tutorial_url_en');
      const ytEs = settings.find((s: any) => s.key === 'tutorial_url_es');
      
      set({ 
        adminTelegramHandle: adminAlias ? adminAlias.value : onboarding.admin_telegram_handle,
        tutorialUrlEn: ytEn ? ytEn.value : onboarding.tutorial_url_en,
        tutorialUrlEs: ytEs ? ytEs.value : onboarding.tutorial_url_es,
        isLoaded: true 
      });
    } catch (e) {
      console.error('Failed to fetch public settings', e);
      set({ isLoaded: true }); // Prevent infinite retries
    }
  }
}));
