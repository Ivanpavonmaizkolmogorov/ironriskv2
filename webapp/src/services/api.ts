/** Axios API client with JWT interceptor. v3-https-interceptor */

import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
});

// HTTPS upgrade interceptor — runs on EVERY request at runtime in the browser
// Fixes Mixed Content when NEXT_PUBLIC_API_URL was baked with http:// at build time
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined" && window.location.protocol === "https:") {
    const url = config.baseURL || "";
    if (url.startsWith("http://")) {
      config.baseURL = url.replace("http://", "https://");
    }
  }
  return config;
});

// JWT interceptor — reads token from localStorage
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("ironrisk_jwt");
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
});

// Response interceptor — handle 401 globally
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      // If the 401 came from a login or register attempt, let the component handle it (e.g., show "Bad Password" in Simulator modal)
      const isAuthEndpoint = error.config?.url?.includes("/api/auth/login") || error.config?.url?.includes("/api/auth/register");
      
      if (!isAuthEndpoint) {
        localStorage.removeItem("ironrisk_jwt");
        // Only redirect if not already on login or register page
        const path = window.location.pathname;
        if (!path.includes("/login") && !path.includes("/register")) {
          // Use Next-intl friendly pathing if possible, or just default root login.
          window.location.href = "/login";
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;

// --- Auth endpoints ---
export const authAPI = {
  register: (email: string, password: string, locale: string = "es", invite_code?: string) =>
    api.post("/api/auth/register", { email, password, locale, invite_code }),
  login: (email: string, password: string) =>
    api.post("/api/auth/login", { email, password }),
  getMe: () => api.get("/api/auth/me"),
  forgotPassword: (email: string, locale: string = "es") =>
    api.post("/api/auth/forgot-password", { email, locale }),
  resetPassword: (token: string, new_password: string) =>
    api.post("/api/auth/reset-password", { token, new_password }),
};

// --- Trading Account endpoints ---
export const tradingAccountAPI = {
  create: (data: { name: string; broker?: string; account_number?: string }) =>
    api.post("/api/trading-accounts/", data),
  list: () => api.get("/api/trading-accounts/"),
  revoke: (accountId: string) =>
    api.delete(`/api/trading-accounts/${accountId}`),
  rotateToken: (accountId: string) =>
    api.post(`/api/trading-accounts/${accountId}/rotate-token`),
  updateSettings: (accountId: string, data: { default_dashboard_layout?: any; theme?: string | null; name?: string }) =>
    api.patch(`/api/trading-accounts/${accountId}/settings`, data),
};

// --- Strategy endpoints ---
export const strategyAPI = {
  list: (accountId?: string) => api.get(`/api/strategies/${accountId ? `?trading_account_id=${accountId}` : ''}`),
  get: (id: string) => api.get(`/api/strategies/${id}`),
  delete: (id: string) => api.delete(`/api/strategies/${id}`),
  bulkDelete: (ids: string[]) => api.delete("/api/strategies/bulk/delete", { data: { strategy_ids: ids } }),
  deleteAll: () => api.delete("/api/strategies/bulk/all"),
  update: (id: string, data: Partial<import("@/types/strategy").Strategy>) =>
    api.patch(`/api/strategies/${id}`, data),
  upload: (formData: FormData) =>
    api.post("/api/strategies/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
  getChart: (id: string, metric: string, value?: number) => {
    const query = value !== undefined && value !== null ? `?value=${value}` : '';
    return api.get(`/api/strategies/${id}/chart/${metric}${query}`, {
      responseType: 'blob'
    });
  },
  getChartData: (id: string, metric: string, value?: number) => {
    const query = value !== undefined && value !== null ? `?value=${value}` : '';
    return api.get(`/api/strategies/${id}/chart-data/${metric}${query}`);
  },
  getBayes: (id: string, params?: Record<string, any>) => {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          searchParams.set(key, String(value));
        }
      });
    }
    const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
    return api.get(`/api/strategies/${id}/bayes${query}`);
  },
  createFromSimulation: (data: {
    trading_account_id: string;
    name: string;
    magic_number?: number;
    risk_config?: Record<string, any>;
    decomposition?: Record<string, any>;
    risk_suggestions?: Record<string, any>;
    extracted_stats?: Record<string, any>;
    equity_curve?: Record<string, any>[];
    start_date?: string;
    bt_discount?: number;
  }) => api.post("/api/strategies/create-from-simulation", data),
  applyMultiplier: (id: string, risk_multiplier: number) =>
    api.post(`/api/strategies/${id}/apply-multiplier`, { risk_multiplier }),
  getTrades: (id: string, limit: number = 50, offset: number = 0) =>
    api.get(`/api/strategies/${id}/trades?limit=${limit}&offset=${offset}`),
  // VS Mode
  getLinks: (id: string) => api.get(`/api/vs/${id}/links`),
  linkStrategy: (id: string, linkedId: string, windowSeconds: number = 60) =>
    api.post(`/api/vs/${id}/link`, { linked_strategy_id: linkedId, match_window_seconds: windowSeconds }),
  unlinkStrategy: (id: string, linkedId: string) =>
    api.delete(`/api/vs/${id}/link/${linkedId}`),
  getVsComparison: (id: string, linkedId: string, fromDate?: string) =>
    api.get(`/api/vs/${id}/compare/${linkedId}${fromDate ? `?from_date=${fromDate}` : ''}`),
  updateMatchWindow: (id: string, linkedId: string, windowSeconds: number) =>
    api.patch(`/api/vs/${id}/link/${linkedId}/window`, { match_window_seconds: windowSeconds }),
  listCrossWorkspace: (excludeAccountId?: string) =>
    api.get(`/api/vs/strategies/cross-workspace${excludeAccountId ? `?exclude_account_id=${excludeAccountId}` : ''}`),
};

// --- Sandbox: Orphan Magics endpoints ---
export const orphanAPI = {
  list: (accountId: string) => api.get(`/api/orphans/${accountId}`),
  delete: (orphanId: number) => api.delete(`/api/orphans/${orphanId}`),
  trades: (accountId: string, magic: number) => api.get(`/api/orphans/${accountId}/trades/${magic}`),
  link: (accountId: string, magic: number, strategyId: string) =>
    api.post(`/api/orphans/${accountId}/link/${magic}/${strategyId}`),
};

// --- Portfolio endpoints ---
export const portfolioAPI = {
  list: (accountId: string) => api.get(`/api/portfolios/?trading_account_id=${accountId}`),
  create: (data: { trading_account_id: string; name: string; strategy_ids: string[] }) =>
    api.post("/api/portfolios/", data),
  recalculateAll: (accountId: string) => 
    api.post("/api/portfolios/recalculate-all", { trading_account_id: accountId }),
  update: (id: string, data: Partial<import("@/types/strategy").Portfolio>) =>
    api.put(`/api/portfolios/${id}`, data),
  delete: (id: string) => api.delete(`/api/portfolios/${id}`),
  getTrades: (id: string, limit: number = 50, offset: number = 0) =>
    api.get(`/api/portfolios/${id}/trades?limit=${limit}&offset=${offset}`),
  getChart: (id: string, metric: string, value?: number) => {
    const query = value !== undefined && value !== null ? `?value=${value}` : '';
    return api.get(`/api/portfolios/${id}/chart/${metric}${query}`, {
      responseType: 'blob'
    });
  },
  getChartData: (id: string, metric: string, value?: number) => {
    const query = value !== undefined && value !== null ? `?value=${value}` : '';
    return api.get(`/api/portfolios/${id}/chart-data/${metric}${query}`);
  },
  getBayes: (id: string, params?: Record<string, any>) => {
    const searchParams = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          searchParams.set(key, String(value));
        }
      });
    }
    const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
    return api.get(`/api/portfolios/${id}/bayes${query}`);
  },
};

// --- User Preferences & Theme endpoints ---
export const preferencesAPI = {
  getPreferences: () => api.get("/api/user/preferences"),
  updateTheme: (theme: string, applyToAll: boolean = false) => 
    api.patch("/api/user/preferences/theme", { theme, apply_to_all_workspaces: applyToAll }),
  updateLocale: (locale: string) =>
    api.patch("/api/user/profile/i18n", { locale }),
  getThemes: () => api.get("/api/user/themes"),
  createCustomTheme: (data: { label: string, mode: string, colors: Record<string, string> }) => 
    api.post("/api/user/themes/custom", data),
  updateCustomTheme: (id: string, data: { label: string, mode: string, colors: Record<string, string> }) => 
    api.put(`/api/user/themes/custom/${id}`, data),
  deleteCustomTheme: (id: string) => 
    api.delete(`/api/user/themes/custom/${id}`),
};

// --- Admin endpoints ---
export const adminAPI = {
  listUsers: () => api.get('/api/admin/users'),
  deleteUser: (userId: string) => api.delete(`/api/admin/users/${userId}`),
  updateUser: (userId: string, data: { is_admin?: boolean, password?: string }) =>
    api.patch(`/api/admin/users/${userId}`, data),
};

// --- Waitlist (lead capture) ---
export const waitlistAPI = {
  submit: (email: string, source: string = "register", locale: string = "es", motivation: string = "") =>
    api.post('/api/waitlist', { email, source, locale, motivation }),
  list: () => api.get('/api/waitlist'),
  remove: (id: string) => api.delete(`/api/waitlist/${id}`),
};

// --- System Settings endpoints ---
export const settingsAPI = {
  getPublic: () => api.get('/api/settings/public'),
  get: (key: string) => api.get(`/api/settings/${key}`),
  update: (key: string, value: string, description?: string) =>
    api.put(`/api/settings/${key}`, { value, description }),
};

