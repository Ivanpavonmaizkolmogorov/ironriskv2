import { create } from 'zustand';

interface SimulatorParams {
  winRate: number;
  avgWin: number;
  avgLoss: number;
  stdWin: number;
  stdLoss: number;
  nTrades: number;
}

interface SimulatorState {
  activeTab: 'manual' | 'csv';
  params: SimulatorParams;
  csvPnl: number[] | null;
  csvFile: File | null;
  result: any | null;
  showOnboarding: boolean;

  setActiveTab: (tab: 'manual' | 'csv') => void;
  setParams: (params: SimulatorParams) => void;
  setCsvData: (pnl: number[] | null, file: File | null) => void;
  setResult: (result: any | null) => void;
  setShowOnboarding: (show: boolean) => void;
  reset: () => void;
}

const defaultParams: SimulatorParams = {
  winRate: 50.0,
  avgWin: 100.0,
  avgLoss: 80.0,
  stdWin: 50.0,
  stdLoss: 40.0,
  nTrades: 200,
};

export const useSimulatorStore = create<SimulatorState>((set) => ({
  activeTab: 'manual',
  params: defaultParams,
  csvPnl: null,
  csvFile: null,
  result: null,
  showOnboarding: false,

  setActiveTab: (tab) => set({ activeTab: tab }),
  setParams: (params) => set({ params }),
  setCsvData: (csvPnl, csvFile) => set({ csvPnl, csvFile }),
  setResult: (result) => set({ result }),
  setShowOnboarding: (showOnboarding) => set({ showOnboarding }),
  reset: () => set({
    activeTab: 'manual',
    params: defaultParams,
    csvPnl: null,
    csvFile: null,
    result: null,
    showOnboarding: false,
  }),
}));
