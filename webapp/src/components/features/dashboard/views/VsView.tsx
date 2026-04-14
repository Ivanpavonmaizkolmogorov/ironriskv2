/**
 * VS Mode View — Cross-workspace strategy comparison.
 * 
 * Architecture:
 * - VsView: Main controller, manages linking state and comparison data
 * - VsLinkWizard: UI for linking a strategy to twins
 * - VsComparisonPanel: Displays the VS results (metrics, trades, divergence)
 * - VsMetricRow: Single metric comparison row with delta indicator
 */
"use client";

import React, { useState, useEffect, useCallback } from "react";
import { useTranslations, useLocale } from "next-intl";
import { strategyAPI } from "@/services/api";
import type { DashboardContext } from "../dashboardViewConfigs";
import Card from "@/components/ui/Card";
import InfoPopover from "@/components/ui/InfoPopover";


// ═══════════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════════

interface VsLink {
  link_id: string;
  strategy_id: string;
  strategy_name: string;
  workspace_name: string;
  broker: string;
  account_number: string;
  match_window_seconds: number;
  created_at: string | null;
}

interface CrossWorkspaceStrategy {
  strategy_id: string;
  strategy_name: string;
  magic_number: number;
  workspace_id: string;
  workspace_name: string;
  broker: string;
  total_trades: number;
}

interface TradeSummary {
  ticket: number;
  symbol: string;
  deal_type: string;
  volume: number;
  open_time: string | null;
  close_time: string | null;
  open_price: number | null;
  close_price: number | null;
  profit: number;
}

interface MatchedTrade {
  trade_a: TradeSummary;
  trade_b: TradeSummary;
  entry_price_delta: number;
  exit_price_delta: number;
  pnl_delta: number;
  timing_delta_seconds: number;
}

interface DivergenceStats {
  total_trades_a: number;
  total_trades_b: number;
  matched_count: number;
  orphan_count_a: number;
  orphan_count_b: number;
  match_rate: number;
  avg_entry_slippage: number;
  avg_exit_slippage: number;
  avg_pnl_delta: number;
  total_pnl_delta: number;
  avg_timing_delta_seconds: number;
}

interface StrategySummary {
  strategy_id: string;
  name: string;
  workspace_name: string;
  broker: string;
  total_trades: number;
  wins: number;
  losses: number;
  win_rate: number;
  first_trade_date: string | null;
}

interface VsComparisonData {
  summary_a: StrategySummary;
  summary_b: StrategySummary;
  divergence_stats: DivergenceStats;
  matched_trades: MatchedTrade[];
  orphan_trades_a: TradeSummary[];
  orphan_trades_b: TradeSummary[];
  match_window_seconds: number;
  from_date: string | null;
}


// ═══════════════════════════════════════════════════════════
//  METRIC ROW COMPONENT
// ═══════════════════════════════════════════════════════════

function VsMetricRow({
  label,
  valueA,
  valueB,
  format = "number",
  higherIsBetter = true,
}: {
  label: string;
  valueA: number;
  valueB: number;
  format?: "number" | "percent" | "currency";
  higherIsBetter?: boolean;
}) {
  const delta = valueB - valueA;
  const isGood = higherIsBetter ? delta >= 0 : delta <= 0;
  const isBad = higherIsBetter ? delta < 0 : delta > 0;
  const isNeutral = Math.abs(delta) < 0.01;

  const fmt = (v: number) => {
    if (format === "percent") return `${v.toFixed(1)}%`;
    if (format === "currency") return `$${v.toFixed(2)}`;
    return v.toFixed(2);
  };

  return (
    <div className="flex items-center py-2 px-3 rounded-lg hover:bg-surface-tertiary/40 transition-colors">
      <span className="text-xs text-iron-400 w-32 shrink-0 font-medium">{label}</span>
      <span className="text-sm font-mono text-iron-200 w-28 text-right">{fmt(valueA)}</span>
      <span className="text-iron-600 mx-4 text-xs">↔</span>
      <span className="text-sm font-mono text-iron-200 w-28 text-right">{fmt(valueB)}</span>
      <span className={`ml-4 text-xs font-bold px-2 py-0.5 rounded-full ${
        isNeutral
          ? "bg-iron-800 text-iron-400"
          : isGood
            ? "bg-risk-green/15 text-risk-green"
            : "bg-risk-red/15 text-risk-red"
      }`}>
        {isNeutral ? "=" : delta > 0 ? `+${fmt(delta)}` : fmt(delta)}
      </span>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════
//  LINK WIZARD COMPONENT
// ═══════════════════════════════════════════════════════════

function VsLinkWizard({
  strategyId,
  accountId,
  onLinked,
}: {
  strategyId: string;
  accountId: string;
  onLinked: () => void;
}) {
  const t = useTranslations("vsMode");
  const [crossStrategies, setCrossStrategies] = useState<CrossWorkspaceStrategy[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedWorkspace, setSelectedWorkspace] = useState<string>("");
  const [selectedStrategy, setSelectedStrategy] = useState<string>("");
  const [linking, setLinking] = useState(false);
  const [windowSeconds, setWindowSeconds] = useState(60);

  useEffect(() => {
    strategyAPI.listCrossWorkspace(accountId).then(res => {
      setCrossStrategies(res.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [accountId]);

  // Group by workspace
  const workspaces = [...new Map(crossStrategies.map(s => [s.workspace_id, { id: s.workspace_id, name: s.workspace_name, broker: s.broker }])).values()];
  const filteredStrategies = crossStrategies.filter(s => s.workspace_id === selectedWorkspace);

  const handleLink = async () => {
    if (!selectedStrategy) return;
    setLinking(true);
    try {
      await strategyAPI.linkStrategy(strategyId, selectedStrategy, windowSeconds);
      onLinked();
    } catch (err: any) {
      alert(err?.response?.data?.detail || "Error linking");
    } finally {
      setLinking(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <span className="inline-block w-6 h-6 border-2 border-iron-700 border-t-risk-blue rounded-full animate-spin" />
      </div>
    );
  }

  if (crossStrategies.length === 0) {
    return (
      <div className="text-center py-12 space-y-3">
        <span className="text-4xl">🔗</span>
        <p className="text-sm text-iron-400">{t("noOtherWorkspaces")}</p>
        <p className="text-xs text-iron-600">{t("noOtherWorkspacesDesc")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div className="text-center space-y-2">
        <span className="text-4xl">🔗</span>
        <div className="flex items-center justify-center gap-2">
          <h3 className="text-base font-bold text-iron-100">{t("linkTitle")}</h3>
          <InfoPopover content={t("tipLinkWizard")} position="bottom" width="w-72" />
        </div>
        <p className="text-xs text-iron-500 max-w-md mx-auto">{t("linkDesc")}</p>
      </div>

      {/* Step 1: Select workspace */}
      <div className="space-y-2">
        <label className="text-xs font-bold text-iron-400 uppercase tracking-wider flex items-center gap-2">
          <span className="w-5 h-5 rounded-full bg-risk-green/20 text-risk-green text-[10px] flex items-center justify-center font-bold">1</span>
          {t("selectWorkspace")}
        </label>
        <select
          value={selectedWorkspace}
          onChange={(e) => { setSelectedWorkspace(e.target.value); setSelectedStrategy(""); }}
          className="w-full bg-surface-primary border border-iron-700 rounded-lg px-3 py-2 text-sm text-iron-200 focus:outline-none focus:border-risk-blue transition-colors"
        >
          <option value="">{t("selectWorkspacePlaceholder")}</option>
          {workspaces.map(w => (
            <option key={w.id} value={w.id}>
              {w.name} {w.broker ? `(${w.broker})` : ""}
            </option>
          ))}
        </select>
      </div>

      {/* Step 2: Select strategy */}
      {selectedWorkspace && (
        <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
          <label className="text-xs font-bold text-iron-400 uppercase tracking-wider flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-risk-yellow/20 text-risk-yellow text-[10px] flex items-center justify-center font-bold">2</span>
            {t("selectStrategy")}
          </label>
          <select
            value={selectedStrategy}
            onChange={(e) => setSelectedStrategy(e.target.value)}
            className="w-full bg-surface-primary border border-iron-700 rounded-lg px-3 py-2 text-sm text-iron-200 focus:outline-none focus:border-risk-blue transition-colors"
          >
            <option value="">{t("selectStrategyPlaceholder")}</option>
            {filteredStrategies.map(s => (
              <option key={s.strategy_id} value={s.strategy_id}>
                {s.strategy_name} (Magic: {s.magic_number}) — {s.total_trades} trades
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Match window config */}
      {selectedStrategy && (
        <div className="space-y-2 animate-in fade-in slide-in-from-top-2 duration-200">
          <label className="text-xs font-bold text-iron-400 uppercase tracking-wider flex items-center gap-2">
            <span className="w-5 h-5 rounded-full bg-iron-400/20 text-iron-300 text-[10px] flex items-center justify-center font-bold">⏱</span>
            {t("matchWindow")}
          </label>
          <div className="flex items-center gap-3">
            <input
              type="number"
              min={5}
              max={300}
              value={windowSeconds}
              onChange={(e) => setWindowSeconds(Number(e.target.value))}
              className="w-24 bg-surface-primary border border-iron-700 rounded-lg px-3 py-2 text-sm text-iron-200 font-mono focus:outline-none focus:border-risk-blue transition-colors"
            />
            <span className="text-xs text-iron-500">{t("seconds")}</span>
          </div>
          <p className="text-[10px] text-iron-600">{t("matchWindowDesc")}</p>
        </div>
      )}

      {/* Link button */}
      {selectedStrategy && (
        <button
          onClick={handleLink}
          disabled={linking}
          className="w-full py-3 rounded-xl bg-risk-green/15 border border-risk-green/30 text-risk-green font-bold text-sm
            hover:bg-risk-green/25 hover:border-risk-green/50 transition-all duration-200 active:scale-[0.98]
            disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
        >
          {linking ? (
            <span className="inline-block w-4 h-4 border-2 border-risk-green/30 border-t-risk-green rounded-full animate-spin" />
          ) : (
            <>🔗 {t("linkBtn")}</>
          )}
        </button>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════
//  COMPARISON PANEL COMPONENT
// ═══════════════════════════════════════════════════════════

function VsComparisonPanel({
  link,
  strategyId,
  onUnlink,
}: {
  link: VsLink;
  strategyId: string;
  onUnlink: () => void;
}) {
  const t = useTranslations("vsMode");
  const locale = useLocale();
  const [data, setData] = useState<VsComparisonData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showTrades, setShowTrades] = useState(false);
  const [showOrphans, setShowOrphans] = useState(false);
  const [unlinking, setUnlinking] = useState(false);
  const [fromDate, setFromDate] = useState<string | undefined>(undefined);

  const fetchComparison = useCallback((dateFilter?: string) => {
    setLoading(true);
    strategyAPI.getVsComparison(strategyId, link.strategy_id, dateFilter).then(res => {
      setData(res.data);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [strategyId, link.strategy_id]);

  useEffect(() => {
    fetchComparison(fromDate);
  }, [fetchComparison, fromDate]);

  const handleDateFilter = (date: string | null) => {
    if (!date) {
      setFromDate(undefined);
    } else {
      setFromDate(date.split('T')[0]);  // Use just the date part
    }
  };

  const handleUnlink = async () => {
    if (!confirm(t("unlinkConfirm"))) return;
    setUnlinking(true);
    try {
      await strategyAPI.unlinkStrategy(strategyId, link.strategy_id);
      onUnlink();
    } catch {
      setUnlinking(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="border border-iron-800 rounded-xl p-6 flex items-center justify-center min-h-[200px]">
        <span className="inline-block w-6 h-6 border-2 border-iron-700 border-t-risk-blue rounded-full animate-spin" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="border border-iron-800 rounded-xl p-6 text-center text-iron-500 text-sm">
        {t("errorLoading")}
      </div>
    );
  }

  const { summary_a: a, summary_b: b, divergence_stats: stats } = data;
  const fmtDate = (iso: string | null) => iso ? new Date(iso).toLocaleDateString() : null;

  return (
    <div className="space-y-4 animate-in fade-in duration-300 min-w-0 w-full">
      {/* VS Header */}
      <div className="bg-gradient-to-r from-surface-tertiary to-surface-secondary border border-iron-800 rounded-xl p-3 sm:p-5 min-w-0 w-full overflow-hidden">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚔️</span>
            <h3 className="text-sm font-bold text-iron-100 uppercase tracking-wider">{t("comparison")}</h3>
            <InfoPopover content={t("tipComparison")} position="bottom" width="w-80" />
            {loading && <span className="inline-block w-3 h-3 border border-iron-600 border-t-risk-blue rounded-full animate-spin" />}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-iron-500 font-mono bg-iron-900 px-2 py-0.5 rounded">
              ⏱ ±{data.match_window_seconds}s
            </span>
            <button
              onClick={handleUnlink}
              disabled={unlinking}
              className="text-[10px] text-iron-600 hover:text-risk-red px-2 py-1 rounded transition-colors"
            >
              {unlinking ? "..." : `🗑️ ${t("unlink")}`}
            </button>
          </div>
        </div>

        {/* Date filter bar */}
        <div className="flex items-center gap-2 mb-4 flex-wrap">
          <span className="text-[10px] text-iron-500 font-bold uppercase tracking-wider flex items-center gap-1">📅 {t("dateFilter")}: <InfoPopover content={t("tipDateFilter")} position="bottom" width="w-72" /></span>
          <button
            onClick={() => handleDateFilter(null)}
            className={`text-[10px] px-2.5 py-1 rounded-full font-bold transition-all ${
              !fromDate
                ? "bg-risk-green/20 text-risk-green border border-risk-green/30"
                : "bg-iron-900 text-iron-400 border border-iron-700 hover:border-iron-500"
            }`}
          >
            {t("allTrades")}
          </button>
          {a.first_trade_date && (
            <button
              onClick={() => handleDateFilter(a.first_trade_date)}
              className={`text-[10px] px-2.5 py-1 rounded-full font-bold transition-all ${
                fromDate && fromDate === a.first_trade_date?.split('T')[0]
                  ? "bg-risk-blue/20 text-risk-blue border border-risk-blue/30"
                  : "bg-iron-900 text-iron-400 border border-iron-700 hover:border-iron-500"
              }`}
              title={`${t("fromDate")} ${fmtDate(a.first_trade_date)}`}
            >
              📌 {a.workspace_name} ({fmtDate(a.first_trade_date)})
            </button>
          )}
          {b.first_trade_date && (
            <button
              onClick={() => handleDateFilter(b.first_trade_date)}
              className={`text-[10px] px-2.5 py-1 rounded-full font-bold transition-all ${
                fromDate && fromDate === b.first_trade_date?.split('T')[0]
                  ? "bg-risk-blue/20 text-risk-blue border border-risk-blue/30"
                  : "bg-iron-900 text-iron-400 border border-iron-700 hover:border-iron-500"
              }`}
              title={`${t("fromDate")} ${fmtDate(b.first_trade_date)}`}
            >
              📌 {b.workspace_name} ({fmtDate(b.first_trade_date)})
            </button>
          )}
          {fromDate && (
            <span className="text-[9px] text-iron-600 font-mono ml-1">
              {t("filterActive")}: ≥ {fromDate}
            </span>
          )}
        </div>

        {/* Side by side headers */}
        <div className="grid grid-cols-2 gap-2 sm:gap-4 mb-4">
          <div className="bg-surface-primary/50 rounded-lg p-2 sm:p-3 border border-iron-800/50 min-w-0 overflow-hidden">
            <p className="text-[10px] sm:text-xs text-iron-500 truncate">{a.workspace_name}</p>
            <p className="text-xs sm:text-sm font-bold text-iron-100 truncate">{a.name}</p>
            <div className="flex items-center gap-2 mt-1">
              {a.broker && <span className="text-[10px] text-iron-600">{a.broker}</span>}
              {a.first_trade_date && <span className="text-[9px] text-iron-700 font-mono">1st: {fmtDate(a.first_trade_date)}</span>}
            </div>
          </div>
          <div className="bg-surface-primary/50 rounded-lg p-2 sm:p-3 border border-iron-800/50 min-w-0 overflow-hidden">
            <p className="text-[10px] sm:text-xs text-iron-500 truncate">{b.workspace_name}</p>
            <p className="text-xs sm:text-sm font-bold text-iron-100 truncate">{b.name}</p>
            <div className="flex items-center gap-2 mt-1">
              {b.broker && <span className="text-[10px] text-iron-600">{b.broker}</span>}
              {b.first_trade_date && <span className="text-[9px] text-iron-700 font-mono">1st: {fmtDate(b.first_trade_date)}</span>}
            </div>
          </div>
        </div>

        {/* Metrics comparison */}
        <div className="flex items-center gap-2 mb-2">
          <span className="text-[10px] text-iron-500 font-bold uppercase tracking-wider">📊 {t("metricsLabel")}</span>
          <InfoPopover content={t("tipMetrics")} position="bottom" width="w-72" />
        </div>
        <div className="space-y-0.5 bg-surface-primary/30 rounded-lg border border-iron-800/30 divide-y divide-iron-800/30">
          <VsMetricRow label={t("winRate")} valueA={a.win_rate} valueB={b.win_rate} format="percent" higherIsBetter={true} />
          <VsMetricRow label={t("wins")} valueA={a.wins} valueB={b.wins} format="number" higherIsBetter={true} />
          <VsMetricRow label={t("losses")} valueA={a.losses} valueB={b.losses} format="number" higherIsBetter={false} />
          <VsMetricRow label={t("totalTrades")} valueA={a.total_trades} valueB={b.total_trades} format="number" higherIsBetter={true} />
        </div>
      </div>

      {/* Divergence Stats */}
      <div className="bg-surface-secondary border border-iron-800 rounded-xl p-3 sm:p-5 min-w-0 w-full overflow-hidden">
        <h4 className="text-xs font-bold text-iron-400 uppercase tracking-wider mb-3 flex items-center gap-2">
          <span>📊</span> {t("divergenceStats")} <InfoPopover content={t("tipDivergence")} position="bottom" width="w-80" />
        </h4>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard
            label={t("matchRate")}
            value={`${stats.match_rate}%`}
            detail={`${stats.matched_count}/${Math.max(stats.total_trades_a, stats.total_trades_b)}`}
            color={stats.match_rate >= 95 ? "green" : stats.match_rate >= 80 ? "yellow" : "red"}
          />
          <StatCard
            label={t("avgSlippage")}
            value={`${stats.avg_entry_slippage > 0 ? "+" : ""}${stats.avg_entry_slippage.toFixed(5)}`}
            detail={t("entryPrice")}
            color={Math.abs(stats.avg_entry_slippage) < 0.0001 ? "green" : "yellow"}
          />
          <StatCard
            label={t("pnlDelta")}
            value={`$${stats.avg_pnl_delta > 0 ? "+" : ""}${stats.avg_pnl_delta.toFixed(2)}`}
            detail={`${t("perTrade")}`}
            color={stats.avg_pnl_delta >= 0 ? "green" : "red"}
          />
          <StatCard
            label={t("hiddenCost")}
            value={`$${stats.total_pnl_delta > 0 ? "+" : ""}${stats.total_pnl_delta.toFixed(2)}`}
            detail={t("cumulative")}
            color={stats.total_pnl_delta >= 0 ? "green" : "red"}
          />
        </div>

        {/* Orphan counts */}
        {(stats.orphan_count_a > 0 || stats.orphan_count_b > 0) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {stats.orphan_count_a > 0 && (
              <span className="text-[10px] bg-risk-yellow/10 text-risk-yellow border border-risk-yellow/20 px-2 py-1 rounded-full">
                ⚠️ {stats.orphan_count_a} {t("orphansIn")} {a.workspace_name}
              </span>
            )}
            {stats.orphan_count_b > 0 && (
              <span className="text-[10px] bg-risk-yellow/10 text-risk-yellow border border-risk-yellow/20 px-2 py-1 rounded-full">
                ⚠️ {stats.orphan_count_b} {t("orphansIn")} {b.workspace_name}
              </span>
            )}
          </div>
        )}
      </div>

      {/* Expandable Matched Trades */}
      {data.matched_trades.length > 0 && (
        <div className="border border-iron-800 rounded-xl overflow-hidden">
          <button
            onClick={() => setShowTrades(!showTrades)}
            className="w-full flex items-center justify-between px-5 py-3 bg-surface-secondary hover:bg-surface-tertiary transition-colors"
          >
            <span className="text-xs font-bold text-iron-400 uppercase tracking-wider flex items-center gap-2">
              <span>🔍</span> {t("matchedTrades")} ({data.matched_trades.length}) <InfoPopover content={t("tipMatchedTrades")} position="bottom" width="w-72" />
            </span>
            <span className={`text-iron-500 text-xs transition-transform duration-200 ${showTrades ? "rotate-180" : ""}`}>▼</span>
          </button>
          {showTrades && (
            <div className="max-h-[400px] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-surface-tertiary">
                  <tr className="text-iron-500 text-[10px] uppercase tracking-wider">
                    <th className="px-3 py-2 text-left">Symbol</th>
                    <th className="px-3 py-2 text-left">Type</th>
                    <th className="px-3 py-2 text-right">ΔEntry</th>
                    <th className="px-3 py-2 text-right">ΔExit</th>
                    <th className="px-3 py-2 text-right">ΔP&L</th>
                    <th className="px-3 py-2 text-right">ΔTime</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-iron-800/30">
                  {data.matched_trades.map((m, i) => (
                    <tr key={i} className="hover:bg-surface-tertiary/40 transition-colors">
                      <td className="px-3 py-1.5 text-iron-200 font-mono">{m.trade_a.symbol}</td>
                      <td className="px-3 py-1.5">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
                          m.trade_a.deal_type === "Buy" ? "bg-risk-green/15 text-risk-green" : "bg-risk-red/15 text-risk-red"
                        }`}>{m.trade_a.deal_type}</span>
                      </td>
                      <td className={`px-3 py-1.5 text-right font-mono ${Math.abs(m.entry_price_delta) < 0.0001 ? "text-iron-600" : "text-risk-yellow"}`}>
                        {m.entry_price_delta > 0 ? "+" : ""}{m.entry_price_delta.toFixed(5)}
                      </td>
                      <td className={`px-3 py-1.5 text-right font-mono ${Math.abs(m.exit_price_delta) < 0.0001 ? "text-iron-600" : "text-risk-yellow"}`}>
                        {m.exit_price_delta > 0 ? "+" : ""}{m.exit_price_delta.toFixed(5)}
                      </td>
                      <td className={`px-3 py-1.5 text-right font-mono font-bold ${
                        m.pnl_delta > 0 ? "text-risk-green" : m.pnl_delta < 0 ? "text-risk-red" : "text-iron-600"
                      }`}>
                        {m.pnl_delta > 0 ? "+" : ""}${m.pnl_delta.toFixed(2)}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-iron-500">
                        {m.timing_delta_seconds > 0 ? "+" : ""}{m.timing_delta_seconds.toFixed(1)}s
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Expandable Orphan Trades */}
      {(data.orphan_trades_a.length > 0 || data.orphan_trades_b.length > 0) && (
        <div className="border border-risk-yellow/20 rounded-xl overflow-hidden">
          <button
            onClick={() => setShowOrphans(!showOrphans)}
            className="w-full flex items-center justify-between px-5 py-3 bg-risk-yellow/5 hover:bg-risk-yellow/10 transition-colors"
          >
            <span className="text-xs font-bold text-risk-yellow uppercase tracking-wider flex items-center gap-2">
              <span>⚠️</span> {t("orphanTrades")} ({data.orphan_trades_a.length + data.orphan_trades_b.length}) <InfoPopover content={t("tipOrphanTrades")} position="bottom" width="w-72" />
            </span>
            <span className={`text-iron-500 text-xs transition-transform duration-200 ${showOrphans ? "rotate-180" : ""}`}>▼</span>
          </button>
          {showOrphans && (
            <div className="max-h-[300px] overflow-y-auto p-4 space-y-3">
              {data.orphan_trades_a.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-iron-400 uppercase mb-1">
                    {t("onlyIn")} {data.summary_a.workspace_name} ({data.orphan_trades_a.length})
                  </p>
                  {data.orphan_trades_a.map((ot, i) => (
                    <div key={i} className="flex items-center gap-3 py-1 text-xs text-iron-400">
                      <span className="font-mono">{ot.symbol}</span>
                      <span className={ot.deal_type === "Buy" ? "text-risk-green" : "text-risk-red"}>{ot.deal_type}</span>
                      <span className="font-mono">${ot.profit.toFixed(2)}</span>
                      <span className="text-iron-600">{ot.open_time ? new Date(ot.open_time).toLocaleString() : "-"}</span>
                    </div>
                  ))}
                </div>
              )}
              {data.orphan_trades_b.length > 0 && (
                <div>
                  <p className="text-[10px] font-bold text-iron-400 uppercase mb-1">
                    {t("onlyIn")} {data.summary_b.workspace_name} ({data.orphan_trades_b.length})
                  </p>
                  {data.orphan_trades_b.map((ot, i) => (
                    <div key={i} className="flex items-center gap-3 py-1 text-xs text-iron-400">
                      <span className="font-mono">{ot.symbol}</span>
                      <span className={ot.deal_type === "Buy" ? "text-risk-green" : "text-risk-red"}>{ot.deal_type}</span>
                      <span className="font-mono">${ot.profit.toFixed(2)}</span>
                      <span className="text-iron-600">{ot.open_time ? new Date(ot.open_time).toLocaleString() : "-"}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════
//  STAT CARD COMPONENT
// ═══════════════════════════════════════════════════════════

function StatCard({
  label,
  value,
  detail,
  color,
}: {
  label: string;
  value: string;
  detail: string;
  color: "green" | "yellow" | "red";
}) {
  const colors = {
    green: "bg-risk-green/10 border-risk-green/20 text-risk-green",
    yellow: "bg-risk-yellow/10 border-risk-yellow/20 text-risk-yellow",
    red: "bg-risk-red/10 border-risk-red/20 text-risk-red",
  };

  return (
    <div className={`rounded-lg border p-3 ${colors[color]}`}>
      <p className="text-[10px] font-bold uppercase tracking-wider opacity-70">{label}</p>
      <p className="text-lg font-bold font-mono mt-1">{value}</p>
      <p className="text-[10px] opacity-60 mt-0.5">{detail}</p>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════
//  SUGGESTION BANNER — name-match auto-detection
// ═══════════════════════════════════════════════════════════

function VsSuggestionBanner({
  strategyId,
  strategyName,
  accountId,
  existingLinkIds,
  onLinked,
}: {
  strategyId: string;
  strategyName: string;
  accountId: string;
  existingLinkIds: string[];
  onLinked: () => void;
}) {
  const t = useTranslations("vsMode");
  const [candidates, setCandidates] = useState<CrossWorkspaceStrategy[]>([]);
  const [linking, setLinking] = useState<string | null>(null);

  useEffect(() => {
    strategyAPI.listCrossWorkspace(accountId).then(res => {
      const matches = (res.data as CrossWorkspaceStrategy[]).filter(
        s => s.strategy_name.trim().toLowerCase() === strategyName.trim().toLowerCase()
          && !existingLinkIds.includes(s.strategy_id)
      );
      setCandidates(matches);
    }).catch(() => {});
  }, [accountId, strategyName, existingLinkIds]);

  const handleQuickLink = async (candidateId: string) => {
    setLinking(candidateId);
    try {
      await strategyAPI.linkStrategy(strategyId, candidateId, 60);
      onLinked();
    } catch (err: any) {
      alert(err?.response?.data?.detail || "Error");
    } finally {
      setLinking(null);
    }
  };

  if (candidates.length === 0) return null;

  return (
    <div className="border border-risk-blue/30 bg-risk-blue/5 rounded-xl p-4 animate-in fade-in duration-300">
      <h4 className="text-xs font-bold text-risk-blue uppercase tracking-wider mb-2 flex items-center gap-2">
        <span>💡</span> {t("suggestionTitle")}
        <InfoPopover content={t("tipSuggestion")} position="bottom" width="w-72" />
      </h4>
      <p className="text-[10px] text-iron-400 mb-3">{t("suggestionDesc")}</p>
      <div className="space-y-2">
        {candidates.map(c => (
          <div key={c.strategy_id} className="flex items-center justify-between bg-surface-primary/60 rounded-lg p-3 border border-iron-800/50">
            <div className="min-w-0">
              <p className="text-xs font-bold text-iron-100 truncate">{c.strategy_name}</p>
              <p className="text-[10px] text-iron-500">{c.workspace_name} {c.broker ? `(${c.broker})` : ''} · {c.total_trades} trades</p>
            </div>
            <button
              onClick={() => handleQuickLink(c.strategy_id)}
              disabled={linking === c.strategy_id}
              className="shrink-0 ml-3 px-3 py-1.5 text-[10px] font-bold rounded-lg 
                bg-risk-green/15 border border-risk-green/30 text-risk-green
                hover:bg-risk-green/25 hover:border-risk-green/50 transition-all
                disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-1"
            >
              {linking === c.strategy_id ? (
                <span className="inline-block w-3 h-3 border border-risk-green/30 border-t-risk-green rounded-full animate-spin" />
              ) : (
                <>🔗 {t("quickLink")}</>
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════
//  BULK MATCH MODAL
// ═══════════════════════════════════════════════════════════

interface BulkCandidate {
  localStrategy: CrossWorkspaceStrategy;
  remoteStrategy: CrossWorkspaceStrategy;
  selected: boolean;
}

function VsBulkMatchModal({
  accountId,
  onClose,
  onLinked,
}: {
  accountId: string;
  onClose: () => void;
  onLinked: () => void;
}) {
  const t = useTranslations("vsMode");
  const [candidates, setCandidates] = useState<BulkCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [linking, setLinking] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  useEffect(() => {
    // Load ALL strategies (no exclusion) to find cross-workspace name matches
    Promise.all([
      strategyAPI.listCrossWorkspace(), // all strategies across all workspaces
    ]).then(([allRes]) => {
      const all = allRes.data as CrossWorkspaceStrategy[];
      const local = all.filter(s => s.workspace_id === accountId);
      const remote = all.filter(s => s.workspace_id !== accountId);

      const pairs: BulkCandidate[] = [];
      for (const ls of local) {
        for (const rs of remote) {
          if (ls.strategy_name.trim().toLowerCase() === rs.strategy_name.trim().toLowerCase()) {
            pairs.push({ localStrategy: ls, remoteStrategy: rs, selected: true });
          }
        }
      }
      setCandidates(pairs);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [accountId]);

  const toggleCandidate = (idx: number) => {
    setCandidates(prev => prev.map((c, i) => i === idx ? { ...c, selected: !c.selected } : c));
  };

  const toggleAll = (selected: boolean) => {
    setCandidates(prev => prev.map(c => ({ ...c, selected })));
  };

  const handleBulkLink = async () => {
    const selected = candidates.filter(c => c.selected);
    if (selected.length === 0) return;
    setLinking(true);
    setProgress({ done: 0, total: selected.length });

    let done = 0;
    for (const c of selected) {
      try {
        await strategyAPI.linkStrategy(c.localStrategy.strategy_id, c.remoteStrategy.strategy_id, 60);
      } catch {
        // Skip duplicates / errors silently
      }
      done++;
      setProgress({ done, total: selected.length });
    }

    setLinking(false);
    onLinked();
    onClose();
  };

  const selectedCount = candidates.filter(c => c.selected).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-surface-secondary border border-iron-700 rounded-2xl w-full max-w-2xl max-h-[80vh] flex flex-col shadow-2xl animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-iron-800">
          <div className="flex items-center gap-3">
            <span className="text-xl">⚡</span>
            <div>
              <h3 className="text-sm font-bold text-iron-100">{t("bulkMatchTitle")}</h3>
              <p className="text-[10px] text-iron-500">{t("bulkMatchDesc")}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-iron-500 hover:text-iron-200 text-lg transition-colors">✕</button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <span className="inline-block w-6 h-6 border-2 border-iron-700 border-t-risk-blue rounded-full animate-spin" />
            </div>
          ) : candidates.length === 0 ? (
            <div className="text-center py-12 space-y-2">
              <span className="text-3xl">🔍</span>
              <p className="text-sm text-iron-400">{t("bulkNoMatches")}</p>
              <p className="text-xs text-iron-600">{t("bulkNoMatchesDesc")}</p>
            </div>
          ) : (
            <>
              {/* Select all / none */}
              <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] text-iron-500">
                  {t("bulkFound", { count: candidates.length })}
                </span>
                <div className="flex items-center gap-2">
                  <button onClick={() => toggleAll(true)} className="text-[10px] text-risk-blue hover:underline">{t("selectAll")}</button>
                  <span className="text-iron-700">|</span>
                  <button onClick={() => toggleAll(false)} className="text-[10px] text-iron-500 hover:underline">{t("selectNone")}</button>
                </div>
              </div>

              {/* Candidate list */}
              <div className="space-y-2">
                {candidates.map((c, idx) => (
                  <label
                    key={`${c.localStrategy.strategy_id}-${c.remoteStrategy.strategy_id}`}
                    className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                      c.selected
                        ? "border-risk-green/30 bg-risk-green/5"
                        : "border-iron-800 bg-surface-primary/30 opacity-60"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={c.selected}
                      onChange={() => toggleCandidate(idx)}
                      className="w-4 h-4 rounded accent-risk-green shrink-0"
                    />
                    <div className="flex-1 min-w-0 grid grid-cols-[1fr_auto_1fr] gap-2 items-center">
                      <div className="min-w-0">
                        <p className="text-[10px] text-iron-500 truncate">{c.localStrategy.workspace_name}</p>
                        <p className="text-xs font-bold text-iron-100 truncate">{c.localStrategy.strategy_name}</p>
                        <p className="text-[9px] text-iron-600">{c.localStrategy.total_trades} trades</p>
                      </div>
                      <span className="text-iron-600 text-xs font-bold">⚔️</span>
                      <div className="min-w-0">
                        <p className="text-[10px] text-iron-500 truncate">{c.remoteStrategy.workspace_name}</p>
                        <p className="text-xs font-bold text-iron-100 truncate">{c.remoteStrategy.strategy_name}</p>
                        <p className="text-[9px] text-iron-600">{c.remoteStrategy.total_trades} trades</p>
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {candidates.length > 0 && (
          <div className="px-6 py-4 border-t border-iron-800 flex items-center justify-between">
            {linking ? (
              <div className="flex items-center gap-3 text-sm text-iron-300">
                <span className="inline-block w-4 h-4 border-2 border-iron-600 border-t-risk-green rounded-full animate-spin" />
                {t("bulkLinking")} {progress.done}/{progress.total}
              </div>
            ) : (
              <span className="text-[10px] text-iron-500">
                {selectedCount} {t("bulkSelected")}
              </span>
            )}
            <button
              onClick={handleBulkLink}
              disabled={linking || selectedCount === 0}
              className="px-5 py-2 rounded-xl bg-risk-green/15 border border-risk-green/30 text-risk-green font-bold text-xs
                hover:bg-risk-green/25 hover:border-risk-green/50 transition-all
                disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {!linking && <>⚡ {t("bulkLinkBtn", { count: selectedCount })}</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════
//  MAIN VS VIEW
// ═══════════════════════════════════════════════════════════

export function VsView({ context }: { context: DashboardContext }) {
  const { activeAsset, accountId } = context;
  const t = useTranslations("vsMode");
  const [links, setLinks] = useState<VsLink[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBulkModal, setShowBulkModal] = useState(false);

  const isStrategy = activeAsset && !("strategy_ids" in activeAsset);

  const loadLinks = useCallback(async () => {
    if (!activeAsset || !isStrategy) {
      setLinks([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await strategyAPI.getLinks(activeAsset.id);
      setLinks(res.data);
    } catch {
      setLinks([]);
    } finally {
      setLoading(false);
    }
  }, [activeAsset?.id, isStrategy]);

  useEffect(() => {
    loadLinks();
  }, [loadLinks]);

  if (!activeAsset) {
    return (
      <Card className="flex items-center justify-center py-12">
        <p className="text-iron-500 text-sm">{t("selectStrategy")}</p>
      </Card>
    );
  }

  if (!isStrategy) {
    return (
      <Card className="flex items-center justify-center py-12 text-center">
        <div className="space-y-2">
          <span className="text-3xl">📁</span>
          <p className="text-iron-400 text-sm">{t("portfolioNotSupported")}</p>
          <p className="text-iron-600 text-xs">{t("portfolioNotSupportedDesc")}</p>
        </div>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card className="flex items-center justify-center py-12">
        <span className="inline-block w-6 h-6 border-2 border-iron-700 border-t-risk-blue rounded-full animate-spin" />
      </Card>
    );
  }

  const existingLinkIds = links.map(l => l.strategy_id);

  return (
    <Card className="min-w-0 w-full overflow-hidden p-2 sm:p-6">
      <div className="space-y-4">
        {/* Bulk match button */}
        <div className="flex items-center justify-end">
          <button
            onClick={() => setShowBulkModal(true)}
            className="px-3 py-1.5 text-[10px] font-bold rounded-lg
              bg-iron-900 border border-iron-700 text-iron-300
              hover:border-risk-blue/50 hover:text-risk-blue transition-all
              flex items-center gap-1.5"
          >
            ⚡ {t("bulkMatchBtn")}
          </button>
        </div>

        {/* Name-match suggestion banner */}
        <VsSuggestionBanner
          strategyId={activeAsset.id}
          strategyName={activeAsset.name}
          accountId={accountId}
          existingLinkIds={existingLinkIds}
          onLinked={loadLinks}
        />

        {/* Existing comparisons */}
        {links.map(link => (
          <VsComparisonPanel
            key={link.link_id}
            link={link}
            strategyId={activeAsset.id}
            onUnlink={loadLinks}
          />
        ))}

        {/* Add new link */}
        <div className={`border border-dashed rounded-xl p-6 ${
          links.length > 0 ? "border-iron-800" : "border-risk-green/30 bg-risk-green/5"
        }`}>
          {links.length > 0 && (
            <h4 className="text-xs font-bold text-iron-400 uppercase tracking-wider mb-4 flex items-center gap-2">
              <span>➕</span> {t("addAnother")}
            </h4>
          )}
          <VsLinkWizard
            strategyId={activeAsset.id}
            accountId={accountId}
            onLinked={loadLinks}
          />
        </div>
      </div>

      {/* Bulk match modal */}
      {showBulkModal && (
        <VsBulkMatchModal
          accountId={accountId}
          onClose={() => setShowBulkModal(false)}
          onLinked={loadLinks}
        />
      )}
    </Card>
  );
}
