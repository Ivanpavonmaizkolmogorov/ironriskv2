import { create } from 'zustand';
import { settingsAPI } from '@/services/api';

interface SettingsState {
  adminTelegramHandle: string;
  isLoaded: boolean;
  fetchSettings: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  adminTelegramHandle: '@IronRisk_Ivan', // Default fallback
  isLoaded: false,
  fetchSettings: async () => {
    if (get().isLoaded) return;
    try {
      const res = await settingsAPI.getPublic();
      const settings = res.data.settings;
      
      const adminAlias = settings.find((s: any) => s.key === 'admin_telegram_handle');
      
      set({ 
        adminTelegramHandle: adminAlias ? adminAlias.value : '@IronRisk_Ivan',
        isLoaded: true 
      });
    } catch (e) {
      console.error('Failed to fetch public settings', e);
      set({ isLoaded: true }); // Prevent infinite retries
    }
  }
}));
