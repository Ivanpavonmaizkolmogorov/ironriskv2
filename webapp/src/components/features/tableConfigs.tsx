import React from "react";
import type { RiskAsset } from "@/types/strategy";
import { metricFormatter } from "@/utils/MetricFormatter";

/* ─── Interfaces ─── */
export interface ColumnDef {
  id: string; // Used for sorting and iteration
  label: string; // Fallback string if no metricKey
  metricKey?: string; // Triggers MetricTooltip and i18n
  align?: "left" | "center" | "right";
  width?: string;
  sortValue: (s: RiskAsset) => number | string;
  renderCell: (s: RiskAsset, allAssets: RiskAsset[], isChild?: boolean) => React.ReactNode;
  renderFooter?: (assets: RiskAsset[]) => React.ReactNode;
}

export interface TableViewDef {
  id: string;
  name: string;
  columns: ColumnDef[];
  defaultSortKey: string;
  defaultSortDir: "asc" | "desc";
}

/* ─── Helpers ─── */
function getBtMax(s: RiskAsset, rootKey: string): number {
  const m = s.metrics_snapshot?.[rootKey] as Record<string, number> | undefined;
  if (m) {
    const maxKey = Object.keys(m).find(k => k.startsWith("max_"));
    return maxKey ? m[maxKey] : 0;
  }
  return 0;
}

function getLiveCurrent(s: RiskAsset, mapKey: string): number | undefined {
  const cfg = s.risk_config as any;
  if (!cfg || !cfg.last_updated) return undefined;
  return cfg[mapKey]?.current;
}

/** Determines if a specific metric has a mathematical fit available */
function hasFitModel(s: RiskAsset, metricKey: string): boolean {
  if (!s.distribution_fit) return false;
  const fit = s.distribution_fit[metricKey];
  return fit && fit.passed === true && fit.distribution_name !== "empirical";
}

/** Wraps a cell value with a subtle indicator if math model is present */
function renderWithFit(valueNode: React.ReactNode, s: RiskAsset, metricKey: string): React.ReactNode {
  const hasModel = hasFitModel(s, metricKey);
  
  if (!hasModel) {
    return (
      <div className="flex items-center justify-end gap-1.5 opacity-80">
        {valueNode}
        <div className="w-[4px] h-[4px] shrink-0" /> {/* Spacer */}
      </div>
    );
  }

  return (
    <div className="flex items-center justify-end gap-1.5">
      {valueNode}
      <div 
        className="w-[4px] h-[4px] rounded-full bg-[#00aaff] opacity-80 shrink-0 shadow-[0_0_6px_rgba(0,170,255,0.7)]" 
        title="Interactive Math Model Available"
      />
    </div>
  );
}

/** Computes max absolute EV for creating width ratios */
function getAbsMaxEV(assets: RiskAsset[]): number {
  return Math.max(...assets.map(s => Math.abs(s.total_trades ? s.net_profit / s.total_trades : 0)), 1);
}

const COMMON_COLUMNS: Record<string, ColumnDef> = {
  name: {
    id: "name",
    label: "Name",
    align: "left",
    sortValue: (s) => s.name.toLowerCase(),
    renderCell: (s, _assets, isChild) => (
      <div className={`max-w-[200px] group relative ${isChild ? "pl-2" : ""}`}>
        <span className={`${isChild ? "text-iron-400 font-normal" : "text-iron-100 font-medium"} truncate block`} title={s.name}>
          {s.name}
        </span>
      </div>
    ),
    renderFooter: (assets) => <span className="text-iron-400 font-semibold text-left block">Total ({assets.length})</span>,
  },
  magic: {
    id: "magic_number",
    label: "#",
    align: "right",
    sortValue: (s) => ("magic_number" in s ? s.magic_number : 0),
    renderCell: (s) => (
      <span className="font-mono text-iron-500 text-xs">
        {"magic_number" in s ? (s.magic_number > 0 ? s.magic_number : "—") : <span className="text-[10px] uppercase bg-iron-800 px-1.5 py-0.5 rounded text-iron-400">{s.strategy_ids?.length || 0} strats</span>}
      </span>
    ),
  },
  trades: {
    id: "total_trades",
    label: "Trades",
    align: "right",
    sortValue: (s) => s.total_trades,
    renderCell: (s) => <span className="font-mono text-iron-300">{metricFormatter.format("total_trades", s.total_trades)}</span>,
    renderFooter: (assets) => <span className="font-mono text-iron-300 font-semibold block text-right">{metricFormatter.format("total_trades", assets.reduce((sum, s) => sum + s.total_trades, 0))}</span>,
  },
  ev: {
    id: "ev",
    label: "Expectancy",
    metricKey: "ev",
    align: "right",
    sortValue: (s) => (s.total_trades ? s.net_profit / s.total_trades : 0),
    renderCell: (s, allAssets) => {
      const ev = s.total_trades ? s.net_profit / s.total_trades : 0;
      const isProfit = ev >= 0;
      const absMax = getAbsMaxEV(allAssets);
      const pct = absMax > 0 ? (Math.abs(ev) / absMax) * 100 : 0;
      
      return (
        <div className="flex flex-col items-end gap-0.5 min-w-[60px]">
          <span className={`font-mono tabular-nums text-sm ${isProfit ? "text-risk-green" : "text-risk-red"}`}>
            {metricFormatter.format("net_profit", ev)}
          </span>
          {/* Visual comparison bar */}
          <div className="w-full h-1 bg-iron-800 rounded-full overflow-hidden flex justify-end">
            <div
              className={`h-full ${isProfit ? "bg-risk-green/50" : "bg-risk-red/50"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      );
    },
    renderFooter: (assets) => {
      const trades = assets.reduce((sum, s) => sum + s.total_trades, 0);
      const pnl = assets.reduce((sum, s) => sum + s.net_profit, 0);
      const ev = trades ? pnl / trades : 0;
      return <span className={`font-mono font-semibold block text-right ${ev >= 0 ? "text-risk-green" : "text-risk-red"}`}>{metricFormatter.format("net_profit", ev)}</span>;
    }
  }
};

const LIVE_COLUMNS: Record<string, ColumnDef> = {
  trades: {
    id: "live_trades",
    label: "Trades",
    align: "right",
    sortValue: (s) => getLiveCurrent(s, "total_trades") || 0,
    renderCell: (s) => {
      const t = getLiveCurrent(s, "total_trades");
      return <span className={`font-mono ${t !== undefined ? "text-iron-300" : "text-iron-600"}`}>{t !== undefined ? metricFormatter.format("total_trades", t) : "—"}</span>;
    },
    renderFooter: (assets) => {
      const trades = assets.reduce((sum, s) => sum + (getLiveCurrent(s, "total_trades") || 0), 0);
      return <span className="font-mono text-iron-300 font-semibold block text-right">{metricFormatter.format("total_trades", trades)}</span>;
    }
  },
  ev: {
    id: "live_ev",
    label: "Expectancy",
    align: "right",
    sortValue: (s) => {
      const trades = getLiveCurrent(s, "total_trades") || 0;
      const pnl = getLiveCurrent(s, "net_profit") || 0;
      return trades ? pnl / trades : 0;
    },
    renderCell: (s, allAssets) => {
      const trades = getLiveCurrent(s, "total_trades");
      if (trades === undefined) return <span className="text-iron-600 font-mono">—</span>;
      const pnl = getLiveCurrent(s, "net_profit") || 0;
      const ev = trades ? pnl / trades : 0;
      const isProfit = ev >= 0;
      
      const liveAbsMax = Math.max(...allAssets.map(a => {
        const t = getLiveCurrent(a, "total_trades") || 0;
        const p = getLiveCurrent(a, "net_profit") || 0;
        return t ? Math.abs(p / t) : 0;
      }), 1);
      
      const pct = liveAbsMax > 0 ? (Math.abs(ev) / liveAbsMax) * 100 : 0;
      
      return (
        <div className="flex flex-col items-end gap-0.5 min-w-[60px]">
          <span className={`font-mono tabular-nums text-sm ${isProfit ? "text-risk-green" : "text-risk-red"}`}>
            {metricFormatter.format("net_profit", ev)}
          </span>
          <div className="w-full h-1 bg-iron-800 rounded-full overflow-hidden flex justify-end">
            <div
              className={`h-full ${isProfit ? "bg-risk-green/50" : "bg-risk-red/50"}`}
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      );
    },
    renderFooter: (assets) => {
      const trades = assets.reduce((sum, s) => sum + (getLiveCurrent(s, "total_trades") || 0), 0);
      const pnl = assets.reduce((sum, s) => sum + (getLiveCurrent(s, "net_profit") || 0), 0);
      const ev = trades ? pnl / trades : 0;
      return <span className={`font-mono font-semibold block text-right ${ev >= 0 ? "text-risk-green" : "text-risk-red"}`}>{metricFormatter.format("net_profit", ev)}</span>;
    }
  }
};

/* ─── View Profiles ─── */

export const BacktestView: TableViewDef = {
  id: "backtest",
  name: "📊 Backtest",
  defaultSortKey: "ev",
  defaultSortDir: "desc",
  columns: [
    COMMON_COLUMNS.name,
    COMMON_COLUMNS.magic,
    COMMON_COLUMNS.trades,
    COMMON_COLUMNS.ev,
    {
      id: "max_dd_bt",
      label: "Max DD",
      metricKey: "max_drawdown",
      align: "right",
      sortValue: (s) => getBtMax(s, "DrawdownMetric"),
      renderCell: (s) => renderWithFit(
        <span className={`font-mono tabular-nums ${hasFitModel(s, "max_drawdown") ? "text-iron-200" : "text-iron-400"}`}>{metricFormatter.format("max_drawdown", getBtMax(s, "DrawdownMetric"))}</span>,
        s, "max_drawdown"
      ),
      renderFooter: (assets) => {
        const mx = Math.max(...assets.map(a => getBtMax(a, "DrawdownMetric")));
        return <span className="font-mono text-iron-300 font-semibold tabular-nums block text-right px-2">{metricFormatter.format("max_drawdown", mx)}</span>;
      }
    },
    {
      id: "daily_loss_bt",
      label: "Max D. Loss",
      metricKey: "daily_loss",
      align: "right",
      sortValue: (s) => getBtMax(s, "DailyLossMetric"),
      renderCell: (s) => renderWithFit(
        <span className={`font-mono tabular-nums ${hasFitModel(s, "daily_loss") ? "text-iron-200" : "text-iron-400"}`}>{metricFormatter.format("daily_loss", getBtMax(s, "DailyLossMetric"))}</span>,
        s, "daily_loss"
      ),
    },
    {
      id: "stag_days_bt",
      label: "Max Stag D.",
      metricKey: "stagnation_days",
      align: "right",
      sortValue: (s) => getBtMax(s, "StagnationDaysMetric"),
      renderCell: (s) => renderWithFit(
        <span className={`font-mono tabular-nums ${hasFitModel(s, "stagnation_days") ? "text-iron-200" : "text-iron-400"}`}>{getBtMax(s, "StagnationDaysMetric")}</span>,
        s, "stagnation_days"
      )
    },
    {
      id: "stag_trades_bt",
      label: "Max Stag T.",
      metricKey: "stagnation_trades",
      align: "right",
      sortValue: (s) => getBtMax(s, "StagnationTradesMetric"),
      renderCell: (s) => renderWithFit(
        <span className={`font-mono tabular-nums ${hasFitModel(s, "stagnation_trades") ? "text-iron-200" : "text-iron-400"}`}>{getBtMax(s, "StagnationTradesMetric")}</span>,
        s, "stagnation_trades"
      )
    },
    {
      id: "consec_loss_bt",
      label: "Max C.L.",
      metricKey: "consecutive_losses",
      align: "right",
      sortValue: (s) => getBtMax(s, "ConsecutiveLossesMetric"),
      renderCell: (s) => renderWithFit(
        <span className={`font-mono tabular-nums ${hasFitModel(s, "consecutive_losses") ? "text-iron-200" : "text-iron-400"}`}>{getBtMax(s, "ConsecutiveLossesMetric")}</span>,
        s, "consecutive_losses"
      )
    }
  ]
};

export const LiveView: TableViewDef = {
  id: "live",
  name: "🔴 Live EA",
  defaultSortKey: "live_dd",
  defaultSortDir: "desc",
  columns: [
    COMMON_COLUMNS.name,
    COMMON_COLUMNS.magic,
    LIVE_COLUMNS.trades,
    LIVE_COLUMNS.ev,
    {
      id: "live_dd",
      label: "Live DD",
      metricKey: "live_max_drawdown",
      align: "right",
      sortValue: (s) => getLiveCurrent(s, "max_drawdown") || 0,
      renderCell: (s) => {
        const val = getLiveCurrent(s, "max_drawdown");
        const isLive = val !== undefined;
        return (
          <span className={`font-mono tabular-nums ${isLive ? "text-iron-300" : "text-iron-600"}`}>
            {isLive ? metricFormatter.format("max_drawdown", val) : "—"}
          </span>
        );
      }
    },
    {
      id: "live_daily_loss",
      label: "Live Daily Loss",
      metricKey: "live_daily_loss",
      align: "right",
      sortValue: (s) => getLiveCurrent(s, "daily_loss") || 0,
      renderCell: (s) => {
        const val = getLiveCurrent(s, "daily_loss");
        const isLive = val !== undefined;
        return (
          <span className={`font-mono tabular-nums ${isLive ? "text-iron-300" : "text-iron-600"}`}>
            {isLive ? metricFormatter.format("daily_loss", val) : "—"}
          </span>
        );
      }
    },
    {
      id: "live_stag_days",
      label: "Live Stag Days",
      metricKey: "live_stagnation_days",
      align: "right",
      sortValue: (s) => getLiveCurrent(s, "stagnation_days") || 0,
      renderCell: (s) => {
        const val = getLiveCurrent(s, "stagnation_days");
        const isLive = val !== undefined;
        return (
          <span className={`font-mono tabular-nums ${isLive ? "text-iron-100" : "text-iron-600"}`}>
            {isLive ? val : "—"}
          </span>
        );
      }
    },
    {
      id: "live_stag_trades",
      label: "Live Stag Trds",
      metricKey: "live_stagnation_trades",
      align: "right",
      sortValue: (s) => getLiveCurrent(s, "stagnation_trades") || 0,
      renderCell: (s) => {
        const val = getLiveCurrent(s, "stagnation_trades");
        const isLive = val !== undefined;
        return (
          <span className={`font-mono tabular-nums ${isLive ? "text-iron-100" : "text-iron-600"}`}>
            {isLive ? val : "—"}
          </span>
        );
      }
    },
    {
      id: "live_consec_loss",
      label: "Live Consec L.",
      metricKey: "live_consecutive_losses",
      align: "right",
      sortValue: (s) => getLiveCurrent(s, "consecutive_losses") || 0,
      renderCell: (s) => {
        const val = getLiveCurrent(s, "consecutive_losses");
        const isLive = val !== undefined;
        return (
          <span className={`font-mono tabular-nums ${isLive ? "text-iron-100" : "text-iron-600"}`}>
            {isLive ? val : "—"}
          </span>
        );
      }
    }
  ]
};

export const HybridView: TableViewDef = {
  id: "hybrid",
  name: "⚖️ Live vs BT",
  defaultSortKey: "hybrid_dd",
  defaultSortDir: "desc",
  columns: [
    COMMON_COLUMNS.name,
    COMMON_COLUMNS.magic,
    LIVE_COLUMNS.trades,
    LIVE_COLUMNS.ev,
    {
      id: "hybrid_dd",
      label: "Drawdown",
      metricKey: "live_max_drawdown",
      align: "right",
      sortValue: (s) => getLiveCurrent(s, "max_drawdown") || 0,
      renderCell: (s) => {
        const live = getLiveCurrent(s, "max_drawdown");
        const limit = getBtMax(s, "DrawdownMetric");
        const isLive = live !== undefined;
        const liveNum = live || 0;
        let color = "text-iron-100";
        if (limit > 0) {
            if (Math.abs(liveNum) > Math.abs(limit * 0.9)) color = "text-risk-red animate-pulse";
            else if (Math.abs(liveNum) > Math.abs(limit * 0.6)) color = "text-risk-yellow";
        }
        
        return (
          <div className="flex flex-col items-end leading-tight group">
             <span className={`font-mono tabular-nums font-semibold ${isLive ? color : "text-iron-600"}`}>
               {isLive ? metricFormatter.format("max_drawdown", live) : "—"}
             </span>
             <span className="text-[9px] text-iron-500 font-mono tracking-tighter uppercase opacity-80 group-hover:opacity-100 transition-opacity">
               LIMIT: {metricFormatter.format("max_drawdown", limit)}
             </span>
          </div>
        );
      }
    },
    {
      id: "hybrid_daily_loss",
      label: "Daily Loss",
      metricKey: "live_daily_loss",
      align: "right",
      sortValue: (s) => getLiveCurrent(s, "daily_loss") || 0,
      renderCell: (s) => {
        const live = getLiveCurrent(s, "daily_loss");
        const limit = getBtMax(s, "DailyLossMetric");
        const isLive = live !== undefined;
        const liveNum = live || 0;
        let color = "text-iron-200";
        if (limit > 0) {
            if (Math.abs(liveNum) > Math.abs(limit * 0.9)) color = "text-risk-red animate-pulse";
            else if (Math.abs(liveNum) > Math.abs(limit * 0.6)) color = "text-risk-yellow";
        }
        
        return (
          <div className="flex flex-col items-end leading-tight group">
             <span className={`font-mono tabular-nums font-semibold ${isLive ? color : "text-iron-600"}`}>
               {isLive ? metricFormatter.format("daily_loss", live) : "—"}
             </span>
             <span className="text-[9px] text-iron-500 font-mono tracking-tighter uppercase opacity-80 group-hover:opacity-100 transition-opacity">
               LIMIT: {metricFormatter.format("daily_loss", limit)}
             </span>
          </div>
        );
      }
    },
    {
      id: "hybrid_stag_days",
      label: "Stagnation",
      metricKey: "live_stagnation_days",
      align: "right",
      sortValue: (s) => getLiveCurrent(s, "stagnation_days") || 0,
      renderCell: (s) => {
        const live = getLiveCurrent(s, "stagnation_days");
        const limit = getBtMax(s, "StagnationDaysMetric");
        const isLive = live !== undefined;
        const liveNum = live || 0;
        let color = "text-iron-200";
        if (limit > 0) {
            if (liveNum > limit * 0.9) color = "text-risk-red";
            else if (liveNum > limit * 0.6) color = "text-risk-yellow";
        }
        
        return (
          <div className="flex flex-col items-end leading-tight group">
             <span className={`font-mono tabular-nums font-semibold ${isLive ? color : "text-iron-600"}`}>
               {isLive ? live : "—"}
             </span>
             <span className="text-[9px] text-iron-500 font-mono tracking-tighter uppercase opacity-80 group-hover:opacity-100 transition-opacity">
               LIMIT: {limit}
             </span>
          </div>
        );
      }
    },
    {
      id: "hybrid_stag_trades",
      label: "Stag Trds",
      metricKey: "live_stagnation_trades",
      align: "right",
      sortValue: (s) => getLiveCurrent(s, "stagnation_trades") || 0,
      renderCell: (s) => {
        const live = getLiveCurrent(s, "stagnation_trades");
        const limit = getBtMax(s, "StagnationTradesMetric");
        const isLive = live !== undefined;
        const liveNum = live || 0;
        let color = "text-iron-200";
        if (limit > 0) {
            if (liveNum > limit * 0.9) color = "text-risk-red animate-pulse";
            else if (liveNum > limit * 0.6) color = "text-risk-yellow";
        }
        
        return (
          <div className="flex flex-col items-end leading-tight group">
             <span className={`font-mono tabular-nums font-semibold ${isLive ? color : "text-iron-600"}`}>
               {isLive ? live : "—"}
             </span>
             <span className="text-[9px] text-iron-500 font-mono tracking-tighter uppercase opacity-80 group-hover:opacity-100 transition-opacity">
               LIMIT: {limit}
             </span>
          </div>
        );
      }
    },
    {
      id: "hybrid_consec_loss",
      label: "Consec L.",
      metricKey: "live_consecutive_losses",
      align: "right",
      sortValue: (s) => getLiveCurrent(s, "consecutive_losses") || 0,
      renderCell: (s) => {
        const live = getLiveCurrent(s, "consecutive_losses");
        const limit = getBtMax(s, "ConsecutiveLossesMetric");
        const isLive = live !== undefined;
        const liveNum = live || 0;
        let color = "text-iron-200";
        if (limit > 0) {
            if (liveNum >= limit) color = "text-risk-red animate-pulse";
            else if (liveNum >= limit * 0.7) color = "text-risk-yellow";
        }
        
        return (
          <div className="flex flex-col items-end leading-tight group">
             <span className={`font-mono tabular-nums font-semibold ${isLive ? color : "text-iron-600"}`}>
               {isLive ? live : "—"}
             </span>
             <span className="text-[9px] text-iron-500 font-mono tracking-tighter uppercase opacity-80 group-hover:opacity-100 transition-opacity">
               LIMIT: {limit}
             </span>
          </div>
        );
      }
    }
  ]
};

export const ALL_TABLE_VIEWS = [BacktestView, LiveView, HybridView];
