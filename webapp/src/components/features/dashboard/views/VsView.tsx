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
  net_profit: number;
  win_rate: number;
  max_drawdown: number;
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
        <h3 className="text-base font-bold text-iron-100">{t("linkTitle")}</h3>
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
    <div className="space-y-4 animate-in fade-in duration-300">
      {/* VS Header */}
      <div className="bg-gradient-to-r from-surface-tertiary to-surface-secondary border border-iron-800 rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚔️</span>
            <h3 className="text-sm font-bold text-iron-100 uppercase tracking-wider">{t("comparison")}</h3>
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
          <span className="text-[10px] text-iron-500 font-bold uppercase tracking-wider">📅 {t("dateFilter")}:</span>
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
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="bg-surface-primary/50 rounded-lg p-3 border border-iron-800/50">
            <p className="text-xs text-iron-500">{a.workspace_name}</p>
            <p className="text-sm font-bold text-iron-100">{a.name}</p>
            <div className="flex items-center gap-2 mt-1">
              {a.broker && <span className="text-[10px] text-iron-600">{a.broker}</span>}
              {a.first_trade_date && <span className="text-[9px] text-iron-700 font-mono">1st: {fmtDate(a.first_trade_date)}</span>}
            </div>
          </div>
          <div className="bg-surface-primary/50 rounded-lg p-3 border border-iron-800/50">
            <p className="text-xs text-iron-500">{b.workspace_name}</p>
            <p className="text-sm font-bold text-iron-100">{b.name}</p>
            <div className="flex items-center gap-2 mt-1">
              {b.broker && <span className="text-[10px] text-iron-600">{b.broker}</span>}
              {b.first_trade_date && <span className="text-[9px] text-iron-700 font-mono">1st: {fmtDate(b.first_trade_date)}</span>}
            </div>
          </div>
        </div>

        {/* Metrics comparison */}
        <div className="space-y-0.5 bg-surface-primary/30 rounded-lg border border-iron-800/30 divide-y divide-iron-800/30">
          <VsMetricRow label={t("winRate")} valueA={a.win_rate} valueB={b.win_rate} format="percent" higherIsBetter={true} />
          <VsMetricRow label={t("netProfit")} valueA={a.net_profit} valueB={b.net_profit} format="currency" higherIsBetter={true} />
          <VsMetricRow label={t("maxDrawdown")} valueA={a.max_drawdown} valueB={b.max_drawdown} format="currency" higherIsBetter={false} />
          <VsMetricRow label={t("totalTrades")} valueA={a.total_trades} valueB={b.total_trades} format="number" higherIsBetter={true} />
        </div>
      </div>

      {/* Divergence Stats */}
      <div className="bg-surface-secondary border border-iron-800 rounded-xl p-5">
        <h4 className="text-xs font-bold text-iron-400 uppercase tracking-wider mb-3 flex items-center gap-2">
          <span>📊</span> {t("divergenceStats")}
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
              <span>🔍</span> {t("matchedTrades")} ({data.matched_trades.length})
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
              <span>⚠️</span> {t("orphanTrades")} ({data.orphan_trades_a.length + data.orphan_trades_b.length})
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
//  MAIN VS VIEW
// ═══════════════════════════════════════════════════════════

export function VsView({ context }: { context: DashboardContext }) {
  const { activeAsset, accountId } = context;
  const t = useTranslations("vsMode");
  const [links, setLinks] = useState<VsLink[]>([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <Card>
      <div className="space-y-6">
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
    </Card>
  );
}
