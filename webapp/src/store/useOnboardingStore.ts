/** Onboarding Store — "the backpack" that carries simulator data through registration into workspace creation. */

import { create } from 'zustand';

export interface RiskParam {
  enabled: boolean;
  limit: number;
}

export interface TraderRiskConfig {
  max_drawdown: RiskParam;
  daily_loss: RiskParam;
  consecutive_losses: RiskParam;
  stagnation_trades: RiskParam;
  stagnation_days: RiskParam;
}

export interface RiskSuggestions {
  max_drawdown: number;
  daily_loss: number;
  consecutive_losses: number;
  stagnation_trades: number;
  stagnation_days: number;
  ev_per_trade: number;
  confidence_note: string;
}

interface OnboardingState {
  // Simulator result data
  riskSuggestions: RiskSuggestions | null;
  decomposition: Record<string, any> | null;
  extractedStats: Record<string, any> | null;

  // Backtest equity curve from parsed file (same as workspace upload)
  equityCurve: Record<string, any>[] | null;
  lastTradeDate: string | null;

  // Trader-adjusted risk config (starts from suggestions, trader edits)
  traderRiskConfig: TraderRiskConfig | null;

  // CSV file if they uploaded one
  csvFile: File | null;


  hasData: boolean;

  // Actions
  setSimulationResult: (
    riskSuggestions: RiskSuggestions,
    decomposition: Record<string, any>,
    extractedStats: Record<string, any>,
    csvFile: File | null,
    equityCurve?: Record<string, any>[] | null,
    lastTradeDate?: string | null,
  ) => void;
  updateRiskParam: (key: keyof TraderRiskConfig, field: 'enabled' | 'limit', value: boolean | number) => void;
  clear: () => void;
}

function buildDefaultRiskConfig(suggestions: RiskSuggestions): TraderRiskConfig {
  return {
    max_drawdown: { enabled: true, limit: suggestions.max_drawdown },
    daily_loss: { enabled: true, limit: suggestions.daily_loss },
    consecutive_losses: { enabled: true, limit: suggestions.consecutive_losses },
    stagnation_trades: { enabled: true, limit: suggestions.stagnation_trades },
    stagnation_days: { enabled: true, limit: suggestions.stagnation_days },
  };
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  riskSuggestions: null,
  decomposition: null,
  extractedStats: null,
  equityCurve: null,
  lastTradeDate: null,
  traderRiskConfig: null,
  csvFile: null,
  hasData: false,

  setSimulationResult: (riskSuggestions, decomposition, extractedStats, csvFile, equityCurve, lastTradeDate) => {
    const traderRiskConfig = buildDefaultRiskConfig(riskSuggestions);
    set({
      riskSuggestions,
      decomposition,
      extractedStats,
      equityCurve: equityCurve || null,
      lastTradeDate: lastTradeDate || null,
      traderRiskConfig,
      csvFile,
      hasData: true,
    });
  },

  updateRiskParam: (key, field, value) =>
    set((state) => {
      if (!state.traderRiskConfig) return state;
      return {
        traderRiskConfig: {
          ...state.traderRiskConfig,
          [key]: {
            ...state.traderRiskConfig[key],
            [field]: value,
          },
        },
      };
    }),

  clear: () =>
    set({
      riskSuggestions: null,
      decomposition: null,
      extractedStats: null,
      equityCurve: null,
      lastTradeDate: null,
      traderRiskConfig: null,
      csvFile: null,
      hasData: false,
    }),
}));
