/** Strategy store — dashboard state, cached strategy list. */

import { create } from "zustand";
import { strategyAPI } from "@/services/api";
import type { Strategy } from "@/types/strategy";

interface StrategyState {
  strategies: Strategy[];
  selectedStrategy: Strategy | null;
  isLoading: boolean;
  error: string | null;
  fetchStrategies: () => Promise<void>;
  selectStrategy: (id: string) => void;
  deleteStrategy: (id: string) => Promise<void>;
  updateStrategy: (id: string, data: Partial<Strategy>) => Promise<boolean>;
}

export const useStrategyStore = create<StrategyState>((set, get) => ({
  strategies: [],
  selectedStrategy: null,
  isLoading: false,
  error: null,

  fetchStrategies: async () => {
    set({ isLoading: true, error: null });
    try {
      const res = await strategyAPI.list();
      const strategies = res.data;
      set({ strategies, isLoading: false });
      // Auto-select first if none selected
      if (!get().selectedStrategy && strategies.length > 0) {
        set({ selectedStrategy: strategies[0] });
      }
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Failed to load strategies";
      set({ error: message, isLoading: false });
    }
  },

  selectStrategy: (id) => {
    const strategy = get().strategies.find((s) => s.id === id) || null;
    set({ selectedStrategy: strategy });
  },

  deleteStrategy: async (id) => {
    try {
      await strategyAPI.delete(id);
      set((s) => ({
        strategies: s.strategies.filter((st) => st.id !== id),
        selectedStrategy: s.selectedStrategy?.id === id ? null : s.selectedStrategy,
      }));
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Delete failed";
      set({ error: message });
    }
  },

  updateStrategy: async (id, data) => {
    try {
      const res = await strategyAPI.update(id, data);
      const updatedStrategy = res.data;
      set((s) => ({
        strategies: s.strategies.map((st) => (st.id === id ? updatedStrategy : st)),
        selectedStrategy: s.selectedStrategy?.id === id ? updatedStrategy : s.selectedStrategy,
      }));
      return true;
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || "Update failed";
      set({ error: message });
      return false;
    }
  },
}));
