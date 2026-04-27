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
  tutorialUrlEs: 'https://www.youtube.com/playlist?list=PL2-Vp4inhJRLXEbMuJ2m--H3F72x9V7Pw',
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
        tutorialUrlEs: ytEs ? ytEs.value : 'https://www.youtube.com/playlist?list=PL2-Vp4inhJRLXEbMuJ2m--H3F72x9V7Pw',
        isLoaded: true 
      });
    } catch (e) {
      console.error('Failed to fetch public settings', e);
      set({ isLoaded: true }); // Prevent infinite retries
    }
  }
}));
