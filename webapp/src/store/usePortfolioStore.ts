/** Portfolio store — dashboard state, cached portfolio list. */

import { create } from "zustand";
import { portfolioAPI } from "@/services/api";
import type { Portfolio } from "@/types/strategy";

interface PortfolioState {
  portfolios: Portfolio[];
  selectedPortfolio: Portfolio | null;
  isLoading: boolean;
  error: string | null;
  fetchPortfolios: (accountId: string, silent?: boolean) => Promise<void>;
  selectPortfolio: (id: string) => void;
  createPortfolio: (trading_account_id: string, name: string, strategy_ids: string[]) => Promise<boolean>;
  deletePortfolio: (id: string) => Promise<void>;
  updatePortfolio: (id: string, data: Partial<Portfolio>) => Promise<boolean>;
}

export const usePortfolioStore = create<PortfolioState>((set, get) => ({
  portfolios: [],
  selectedPortfolio: null,
  isLoading: false,
  error: null,

  fetchPortfolios: async (accountId: string, silent = false) => {
    if (!silent) set({ isLoading: true, error: null });
    try {
      const res = await portfolioAPI.list(accountId);
      const portfolios = res.data.portfolios || [];
      set({ portfolios, isLoading: false });
      
      const currentSelected = get().selectedPortfolio;
      if (currentSelected) {
        const updatedSelected = portfolios.find((p: Portfolio) => p.id === currentSelected.id);
        if (updatedSelected) {
          set({ selectedPortfolio: updatedSelected });
        } else {
          set({ selectedPortfolio: null });
        }
      }
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Failed to load portfolios";
      set({ error: message, isLoading: false });
    }
  },

  selectPortfolio: (id) => {
    const portfolio = get().portfolios.find((p) => p.id === id) || null;
    set({ selectedPortfolio: portfolio });
  },

  createPortfolio: async (trading_account_id, name, strategy_ids) => {
    try {
      const res = await portfolioAPI.create({ trading_account_id, name, strategy_ids });
      set((s) => ({
        portfolios: [...s.portfolios, res.data],
      }));
      return true;
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Create failed";
      set({ error: message });
      return false;
    }
  },

  deletePortfolio: async (id) => {
    try {
      await portfolioAPI.delete(id);
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      // 404 = already gone, treat as success; anything else is a real error
      if (status !== 404) {
        const message = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Delete failed";
        set({ error: message });
        return;
      }
    }
    // Always remove from local state (whether API succeeded or returned 404)
    set((s) => ({
      portfolios: s.portfolios.filter((p) => p.id !== id),
      selectedPortfolio: s.selectedPortfolio?.id === id ? null : s.selectedPortfolio,
    }));
  },

  updatePortfolio: async (id, data) => {
    try {
      const res = await portfolioAPI.update(id, data);
      const updatedPortfolio = res.data;
      set((s) => ({
        portfolios: s.portfolios.map((p) => (p.id === id ? updatedPortfolio : p)),
        selectedPortfolio: s.selectedPortfolio?.id === id ? updatedPortfolio : s.selectedPortfolio,
      }));
      return true;
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Update failed";
      set({ error: message });
      return false;
    }
  },
}));
