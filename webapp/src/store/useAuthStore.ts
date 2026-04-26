/** Auth store — JWT, user state, login/logout, impersonation. Persisted in localStorage. */

import { create } from "zustand";
import { authAPI, adminAPI } from "@/services/api";
import type { User } from "@/types/auth";

interface AuthState {
  jwt: string | null;
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  isImpersonating: boolean;
  impersonatingEmail: string | null;
  login: (email: string, pass: string) => Promise<void>;
  register: (email: string, pass: string, inviteCode?: string) => Promise<void>;
  logout: () => void;
  loadUser: () => Promise<void>;
  clearError: () => void;
  impersonate: (userId: string) => Promise<void>;
  stopImpersonating: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  jwt: typeof window !== "undefined" ? localStorage.getItem("ironrisk_jwt") : null,
  user: null,
  isAuthenticated: typeof window !== "undefined" ? !!localStorage.getItem("ironrisk_jwt") : false,
  isLoading: false,
  error: null,
  isImpersonating: typeof window !== "undefined" ? !!sessionStorage.getItem("ironrisk_admin_jwt") : false,
  impersonatingEmail: typeof window !== "undefined" ? sessionStorage.getItem("ironrisk_impersonate_email") : null,

  login: async (email, password) => {
    set({ isLoading: true, error: null });
    const locale = typeof window !== "undefined"
      ? (window.location.pathname.split("/")[1] || "es")
      : "es";
    try {
      const res = await authAPI.login(email, password, locale);

      const token = res.data.access_token;
      localStorage.setItem("ironrisk_jwt", token);
      set({ jwt: token, isAuthenticated: true, isLoading: false });
      // Load user profile
      const userRes = await authAPI.getMe();
      set({ user: userRes.data });
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      let message = "Login failed";
      if (typeof detail === "string") {
        message = detail;
      } else if (Array.isArray(detail) && detail.length > 0) {
        message = detail[0].msg || "Validation error";
      }
      set({ error: message, isLoading: false });
    }
  },

  register: async (email, password, inviteCode) => {
    set({ isLoading: true, error: null });
    try {
      const browserLocale = typeof window !== "undefined" ? (window.location.pathname.split("/")[1] || "es") : "es";
      const res = await authAPI.register(email, password, browserLocale, inviteCode);
      const token = res.data.access_token;
      localStorage.setItem("ironrisk_jwt", token);
      set({ jwt: token, isAuthenticated: true, isLoading: false });
      const userRes = await authAPI.getMe();
      set({ user: userRes.data });
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      let message = "Registration failed";
      if (typeof detail === "string") {
        message = detail;
      } else if (Array.isArray(detail) && detail.length > 0) {
        message = detail[0].msg || "Validation error";
      }
      set({ error: message, isLoading: false });
    }
  },

  logout: () => {
    localStorage.removeItem("ironrisk_jwt");
    sessionStorage.removeItem("ironrisk_admin_jwt");
    sessionStorage.removeItem("ironrisk_impersonate_email");
    set({ jwt: null, user: null, isAuthenticated: false, isImpersonating: false, impersonatingEmail: null });
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
        // Network error / server down: keep isAuthenticated true so they don't get kicked out
        console.error("Failed to load user profile (network error or server down, retaining session):", err);
      }
    }
  },

  impersonate: async (userId: string) => {
    try {
      // Save current admin JWT before switching
      const adminJwt = localStorage.getItem("ironrisk_jwt");
      if (adminJwt) {
        sessionStorage.setItem("ironrisk_admin_jwt", adminJwt);
      }

      const res = await adminAPI.impersonate(userId);
      const { access_token, target_email } = res.data;

      // Switch to the target user's token
      localStorage.setItem("ironrisk_jwt", access_token);
      sessionStorage.setItem("ironrisk_impersonate_email", target_email);
      set({ jwt: access_token, isImpersonating: true, impersonatingEmail: target_email });

      // Reload to refresh all dashboard data as the impersonated user
      window.location.reload();
    } catch (err: any) {
      alert(err.response?.data?.detail || "Failed to impersonate user");
    }
  },

  stopImpersonating: () => {
    const adminJwt = sessionStorage.getItem("ironrisk_admin_jwt");
    if (adminJwt) {
      localStorage.setItem("ironrisk_jwt", adminJwt);
      sessionStorage.removeItem("ironrisk_admin_jwt");
      sessionStorage.removeItem("ironrisk_impersonate_email");
      set({ jwt: adminJwt, isImpersonating: false, impersonatingEmail: null });
      window.location.reload();
    }
  },

  clearError: () => set({ error: null }),
}));
