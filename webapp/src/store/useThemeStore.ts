/** Store for managing user themes. */

import { create } from "zustand";
import { preferencesAPI, tradingAccountAPI } from "@/services/api";

type ThemeColors = Record<string, string>;

export interface Theme {
  label: string;
  description: string;
  mode: string;
  colors: ThemeColors;
}

interface ThemeState {
  globalThemeId: string;
  globalThemeData: Theme | null;
  
  workspaceThemeId: string | null;
  workspaceThemeData: Theme | null;
  activeAccountId: string | null;
  
  effectiveThemeId: string;
  effectiveThemeData: Theme | null;
  
  themes: Record<string, Theme>;
  isLoading: boolean;
  
  loadGlobalTheme: () => Promise<void>;
  loadThemesCatalogue: () => Promise<void>;
  
  setWorkspaceContext: (accountId: string | null, workspaceThemeId: string | null) => void;
  setTheme: (themeId: string, mode: "global" | "workspace", applyToAll?: boolean) => Promise<void>;
  
  createCustomTheme: (label: string, mode: string, colors: ThemeColors) => Promise<void>;
  updateCustomTheme: (themeId: string, label: string, mode: string, colors: ThemeColors) => Promise<void>;
  deleteCustomTheme: (themeId: string) => Promise<void>;

  applyCssVariables: (colors: ThemeColors, mode: string) => void;
  _calculateEffectiveTheme: () => void;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  globalThemeId: "iron_dark",
  globalThemeData: null,
  workspaceThemeId: null,
  workspaceThemeData: null,
  activeAccountId: null,
  effectiveThemeId: "iron_dark",
  effectiveThemeData: null,
  themes: {},
  isLoading: false,

  _calculateEffectiveTheme: () => {
    const state = get();
    const effectiveId = state.workspaceThemeId || state.globalThemeId;
    const effectiveData = state.workspaceThemeData || state.globalThemeData;
    
    set({ effectiveThemeId: effectiveId, effectiveThemeData: effectiveData });
    
    if (effectiveData) {
      get().applyCssVariables(effectiveData.colors, effectiveData.mode);
    }
  },

  loadGlobalTheme: async () => {
    try {
      const res = await preferencesAPI.getPreferences();
      const themeId = res.data.theme;
      const themeData = res.data.theme_data;
      set({ globalThemeId: themeId, globalThemeData: themeData });
      get()._calculateEffectiveTheme();
    } catch (err) {
      console.error("Failed to load global user theme", err);
    }
  },

  loadThemesCatalogue: async () => {
    try {
      const res = await preferencesAPI.getThemes();
      set({ themes: res.data.themes });
    } catch (err) {
      console.error("Failed to load themes catalogue", err);
    }
  },

  setWorkspaceContext: (accountId: string | null, workspaceThemeId: string | null) => {
    const state = get();
    // Use catalogue data if available, fallback null
    const themeData = workspaceThemeId ? state.themes[workspaceThemeId] || null : null;
    
    set({ 
      activeAccountId: accountId, 
      workspaceThemeId, 
      workspaceThemeData: themeData 
    });
    get()._calculateEffectiveTheme();
  },

  setTheme: async (themeId: string, mode: "global" | "workspace", applyToAll = false) => {
    const state = get();
    const newThemeData = state.themes[themeId];
    if (!newThemeData) return;

    // Optimistic UI update
    if (mode === "workspace") {
      set({ workspaceThemeId: themeId, workspaceThemeData: newThemeData });
    } else {
      set({ globalThemeId: themeId, globalThemeData: newThemeData });
      if (applyToAll) {
         set({ workspaceThemeId: null, workspaceThemeData: null });
      }
    }
    
    get()._calculateEffectiveTheme();

    try {
      set({ isLoading: true });
      if (mode === "workspace" && state.activeAccountId) {
        await tradingAccountAPI.updateSettings(state.activeAccountId, { theme: themeId });
      } else {
        await preferencesAPI.updateTheme(themeId, applyToAll);
      }
    } catch (err) {
      console.error("Failed to update theme", err);
      if (mode === "global") {
        await get().loadGlobalTheme();
      }
    } finally {
      set({ isLoading: false });
    }
  },

  createCustomTheme: async (label: string, mode: string, colors: ThemeColors) => {
    try {
      set({ isLoading: true });
      await preferencesAPI.createCustomTheme({ label, mode, colors });
      await get().loadThemesCatalogue(); // reload to get the newly created theme
    } catch (err) {
      console.error("Failed to create custom theme", err);
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  updateCustomTheme: async (themeId: string, label: string, mode: string, colors: ThemeColors) => {
    try {
      set({ isLoading: true });
      await preferencesAPI.updateCustomTheme(themeId, { label, mode, colors });
      await get().loadThemesCatalogue(); // reload to get the updated theme
      
      // reload globals if we just updated the active theme
      if (get().effectiveThemeId === themeId) {
        await get().loadGlobalTheme();
      }
    } catch (err) {
      console.error("Failed to update custom theme", err);
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  deleteCustomTheme: async (themeId: string) => {
    try {
      set({ isLoading: true });
      await preferencesAPI.deleteCustomTheme(themeId);
      await get().loadThemesCatalogue(); // reload 
      
      // if active theme was deleted, fallback to iron_dark
      if (get().effectiveThemeId === themeId) {
        await get().loadGlobalTheme();
      }
    } catch (err) {
      console.error("Failed to delete custom theme", err);
      throw err;
    } finally {
      set({ isLoading: false });
    }
  },

  applyCssVariables: (colors: ThemeColors, mode: string) => {
    if (typeof window === "undefined") return;
    const root = document.documentElement;
    // Apply colors
    Object.entries(colors).forEach(([key, value]) => {
      root.style.setProperty(`--${key}`, value);
    });
    // Apply dark/light class
    if (mode === "dark") {
      root.classList.add("dark");
      root.classList.remove("light");
    } else {
      root.classList.add("light");
      root.classList.remove("dark");
    }
  },
}));
