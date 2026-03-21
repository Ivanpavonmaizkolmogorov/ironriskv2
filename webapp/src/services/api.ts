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
};

// --- Strategy endpoints ---
export const strategyAPI = {
  list: () => api.get("/api/strategies/"),
  get: (id: string) => api.get(`/api/strategies/${id}`),
  delete: (id: string) => api.delete(`/api/strategies/${id}`),
  deleteAll: () => api.delete("/api/strategies/bulk/all"),
  update: (id: string, data: Partial<import("@/types/strategy").Strategy>) =>
    api.patch(`/api/strategies/${id}`, data),
  upload: (formData: FormData) =>
    api.post("/api/strategies/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    }),
};
