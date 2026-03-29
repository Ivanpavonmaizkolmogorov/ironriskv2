/** Axios API client with JWT interceptor. */

import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
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
      localStorage.removeItem("ironrisk_jwt");
      // Only redirect if not already on login or register page
      const path = window.location.pathname;
      if (path !== "/login" && path !== "/register") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export default api;

// --- Auth endpoints ---
export const authAPI = {
  register: (email: string, password: string) =>
    api.post("/api/auth/register", { email, password }),
  login: (email: string, password: string) =>
    api.post("/api/auth/login", { email, password }),
  getMe: () => api.get("/api/auth/me"),
};

// --- Trading Account endpoints ---
export const tradingAccountAPI = {
  create: (data: { name: string; broker?: string; account_number?: string }) =>
    api.post("/api/trading-accounts/", data),
  list: () => api.get("/api/trading-accounts/"),
  revoke: (accountId: string) =>
    api.delete(`/api/trading-accounts/${accountId}`),
  updateSettings: (accountId: string, data: { default_dashboard_layout?: any }) =>
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
  getBayes: (id: string, params?: {
    override_prior?: number;
    override_dd?: number;
    override_daily_loss?: number;
    override_stag_days?: number;
    override_stag_trades?: number;
    override_consec?: number;
    use_hybrid?: boolean;
    max_posterior?: number;
    min_trades_ci?: number;
    ci_confidence?: number;
    disabled_metrics?: string;
  }) => {
    const searchParams = new URLSearchParams();
    if (params) {
      if (params.override_prior !== undefined) searchParams.set('override_prior', String(params.override_prior));
      if (params.override_dd !== undefined) searchParams.set('override_dd', String(params.override_dd));
      if (params.override_daily_loss !== undefined) searchParams.set('override_daily_loss', String(params.override_daily_loss));
      if (params.override_stag_days !== undefined) searchParams.set('override_stag_days', String(params.override_stag_days));
      if (params.override_stag_trades !== undefined) searchParams.set('override_stag_trades', String(params.override_stag_trades));
      if (params.override_consec !== undefined) searchParams.set('override_consec', String(params.override_consec));
      if (params.use_hybrid !== undefined) searchParams.set('use_hybrid', String(params.use_hybrid));
      if (params.max_posterior !== undefined) searchParams.set('max_posterior', String(params.max_posterior));
      if (params.min_trades_ci !== undefined) searchParams.set('min_trades_ci', String(params.min_trades_ci));
      if (params.ci_confidence !== undefined) searchParams.set('ci_confidence', String(params.ci_confidence));
      if (params.disabled_metrics) searchParams.set('disabled_metrics', params.disabled_metrics);
    }
    const query = searchParams.toString() ? `?${searchParams.toString()}` : '';
    return api.get(`/api/strategies/${id}/bayes${query}`);
  },
};

// --- Sandbox: Orphan Magics endpoints ---
export const orphanAPI = {
  list: (accountId: string) => api.get(`/api/orphans/${accountId}`),
  delete: (orphanId: number) => api.delete(`/api/orphans/${orphanId}`),
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
};
