import React from "react";
import type { RiskAsset } from "@/types/strategy";
import { InspectorView } from "./views/InspectorView";
import { MachineLearningView } from "./views/MachineLearningView";
import { VsView } from "./views/VsView";

export interface DashboardContext {
  activeAsset: RiskAsset | null;
  liveEquity: { curve: any[]; trades: number; pnl: number; totalAll: number } | null;
  chartLoading: boolean;
  chartUrl: string | null;
  chartData: any | null;
  activeChartMetric: string | null;
  lastChartReq: { metric: string; value?: number } | null;
  openChart: (metricName: string, value?: number, isUserClick?: boolean, forceRefresh?: boolean) => Promise<void>;
  setLiveEquityVersion: React.Dispatch<React.SetStateAction<number>>;
  liveEquityVersion: number;
  accountId: string;
  fetchStrategies: (accountId: string) => void;
  tWorkspace: any; 
  isLightMode: boolean;
  isInteractiveMode: boolean;
  setIsInteractiveMode: React.Dispatch<React.SetStateAction<boolean>>;
}

export interface DashboardViewDef {
  id: string;
  name: string;
  renderComponent: (context: DashboardContext) => React.ReactNode;
}

export const ObjectInspectorViewDef: DashboardViewDef = {
  id: "inspector",
  name: "🕵️‍♂️ Inspector Micro",
  renderComponent: (context) => <InspectorView context={context} />
};

export const MachineLearningViewDef: DashboardViewDef = {
  id: "ml-bayes",
  name: "🧠 Motor Bayesiano",
  renderComponent: (context) => <MachineLearningView context={context} />
};

export const VsModeViewDef: DashboardViewDef = {
  id: "vs-mode",
  name: "⚔️ VS Mode",
  renderComponent: (context) => <VsView context={context} />
};

export const DASHBOARD_VIEWS: DashboardViewDef[] = [
  ObjectInspectorViewDef,
  MachineLearningViewDef,
  VsModeViewDef
];
