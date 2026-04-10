/** Auth store — JWT, user state, login/logout. Persisted in localStorage. */

import { create } from "zustand";
import { authAPI } from "@/services/api";
import type { User } from "@/types/auth";

interface AuthState {
  jwt: string | null;
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, pass: string) => Promise<void>;
  register: (email: string, pass: string, inviteCode?: string) => Promise<void>;
  logout: () => void;
  loadUser: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  jwt: typeof window !== "undefined" ? localStorage.getItem("ironrisk_jwt") : null,
  user: null,
  isAuthenticated: typeof window !== "undefined" ? !!localStorage.getItem("ironrisk_jwt") : false,
  isLoading: false,
  error: null,

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    try {
      const res = await authAPI.login(email, password);
      const token = res.data.access_token;
      localStorage.setItem("ironrisk_jwt", token);
      set({ jwt: token, isAuthenticated: true, isLoading: false });
      // Load user profile
      const userRes = await authAPI.getMe();
      set({ user: userRes.data });
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Login failed";
      set({ error: message, isLoading: false });
    }
  },

  register: async (email, password, inviteCode) => {
    set({ isLoading: true, error: null });
    // Default locale to "es" or detect it from window, but for simplicity we keep backwards compat
    try {
      const res = await authAPI.register(email, password, "es", inviteCode);
      const token = res.data.access_token;
      localStorage.setItem("ironrisk_jwt", token);
      set({ jwt: token, isAuthenticated: true, isLoading: false });
      const userRes = await authAPI.getMe();
      set({ user: userRes.data });
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Registration failed";
      set({ error: message, isLoading: false });
    }
  },

  logout: () => {
    localStorage.removeItem("ironrisk_jwt");
    set({ jwt: null, user: null, isAuthenticated: false });
  },

  loadUser: async () => {
    try {
      const res = await authAPI.getMe();
      set({ user: res.data, isAuthenticated: true });
    } catch (err: any) {
      // Only clear credentials if it's explicitly an auth rejection (401/403)
      if (err.response?.status === 401 || err.response?.status === 403) {
        set({ jwt: null, user: null, isAuthenticated: false });
        localStorage.removeItem("ironrisk_jwt");
      } else {
        // Network error / server down: keep isAuthenticated true so they don't get kicked out, but user might be null
        console.error("Failed to load user profile (network error or server down, retaining session):", err);
      }
    }
  },

  clearError: () => set({ error: null }),
}));
