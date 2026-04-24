import { create } from 'zustand';
import { settingsAPI } from '@/services/api';

interface SettingsState {
  adminTelegramHandle: string;
  tutorialUrlEn: string;
  tutorialUrlEs: string;
  isLoaded: boolean;
  fetchSettings: () => Promise<void>;
  getTutorialUrl: (locale: string) => string;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  adminTelegramHandle: '@IronRisk_Ivan', // Default fallback
  tutorialUrlEn: 'https://youtu.be/IgGUemRjnoc',
  tutorialUrlEs: 'https://youtu.be/rW_rJLNmtTw',
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
        adminTelegramHandle: adminAlias ? adminAlias.value : '@IronRisk_Ivan',
        tutorialUrlEn: ytEn ? ytEn.value : 'https://youtu.be/IgGUemRjnoc',
        tutorialUrlEs: ytEs ? ytEs.value : 'https://youtu.be/rW_rJLNmtTw',
        isLoaded: true 
      });
    } catch (e) {
      console.error('Failed to fetch public settings', e);
      set({ isLoaded: true }); // Prevent infinite retries
    }
  }
}));
