"use client";

import React, { useState, useEffect, useMemo } from "react";
import { strategyAPI, portfolioAPI } from "@/services/api";
import { DashboardContext } from "./../dashboardViewConfigs";
import EquityCurve from "@/components/features/charts/EquityCurve";
import InfoPopover from "@/components/ui/InfoPopover";
import { useTranslations } from "next-intl";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine
} from "recharts";
import { getVerdictStyle, type VerdictStatus } from "@/utils/VerdictConfig";
import { metricFormatter } from "@/utils/MetricFormatter";
import { Humanizer, type RiskGaugeData } from "@/utils/Humanizer";
import { resolveBlindRisk } from "@/utils/blindRisk";

import GaussianChart from "@/components/features/charts/GaussianChart";
import BayesMathBreakdown from "@/components/features/shared/BayesMathBreakdown";
import MetricTooltip from "@/components/ui/MetricTooltip";


// --- P-Value visualization: simple gauge ---

function PValueGauge({ pValue, label }: { pValue: number; label: string }) {
  const pPct = Math.min(pValue * 100, 100);
  const pos = Math.min(pPct, 100); // position on 0-100 scale
  return (
    <div className="w-full mt-2">
      <div className="relative h-5 rounded-full overflow-hidden bg-iron-800">
        {/* Zone backgrounds */}
        <div className="absolute inset-y-0 left-0 bg-red-500/25" style={{ width: '2%' }} />
        <div className="absolute inset-y-0 bg-amber-500/20" style={{ left: '2%', width: '8%' }} />
        <div className="absolute inset-y-0 bg-emerald-500/15" style={{ left: '10%', right: '0' }} />
        {/* Zone dividers */}
        <div className="absolute inset-y-0 w-px bg-red-500/50" style={{ left: '2%' }} />
        <div className="absolute inset-y-0 w-px bg-amber-500/50" style={{ left: '10%' }} />
        {/* Marker */}
        <div
          className="absolute top-0 bottom-0 w-0.5 z-10"
          style={{
            left: `${Math.max(0.5, Math.min(pos, 99.5))}%`,
            backgroundColor: pos < 2 ? '#ef4444' : pos < 10 ? '#f59e0b' : '#10b981',
            boxShadow: `0 0 6px ${pos < 2 ? '#ef4444' : pos < 10 ? '#f59e0b' : '#10b981'}`,
          }}
        />
        {/* P-value label on bar */}
        <div
          className="absolute top-0 bottom-0 flex items-center text-[9px] font-mono font-bold z-20"
          style={{
            left: `${Math.max(2, Math.min(pos + 1, 85))}%`,
            color: pos < 2 ? '#ef4444' : pos < 10 ? '#f59e0b' : '#10b981',
          }}
        >
          p = {pPct < 0.01 ? '<0.01%' : pPct < 1 ? `${pPct.toFixed(2)}%` : `${pPct.toFixed(1)}%`}
        </div>
      </div>
      <div className="flex justify-between text-[8px] text-iron-600 mt-0.5">
        <span className="text-red-400">🔴 {'<'}2% Inconsistente</span>
        <span className="text-amber-400">🟡 2-10%</span>
        <span className="text-emerald-400">🟢 {'>'}10% Consistente</span>
      </div>
    </div>
  );
}

// --- Types matching new API response ---


interface EVDecomposition {
  theta_mean: number; theta_var: number;
  theta_lower: number; theta_upper: number;
  theta_alpha: number; theta_beta: number;
  bt_win_rate: number; live_win_rate: number | null;
  avg_win_mean: number; avg_win_var: number;
  avg_win_lower: number; avg_win_upper: number;
  avg_win_bt: number; avg_win_live: number | null; avg_win_n: number;
  avg_loss_mean: number; avg_loss_var: number;
  avg_loss_lower: number; avg_loss_upper: number;
  avg_loss_bt: number; avg_loss_live: number | null; avg_loss_n: number;
  ev_mean: number; ev_std: number; ev_var: number;
  ev_lower: number; ev_upper: number;
  blind_risk: number;
  ev_includes_zero: boolean; p_positive: number;
  confidence: number; bt_discount: number;
  n_live: number; n_bt: number; method: string;
  // Raw counts for transparency
  n_bt_wins: number; n_bt_losses: number;
  n_live_wins: number; n_live_losses: number;
  eff_bt_wins: number; eff_bt_losses: number;
}

interface RiskGauge {
  current: number;
  percentile: number;
  status: "green" | "amber" | "red";
  simulated?: boolean;
  limit?: number;
}

interface ConsistencyTest {
  label: string;
  observed: string;
  expected: string;
  p_value: number;
  status: "green" | "amber" | "red";
  // Chart data (optional, varies by test type)
  n?: number;
  k?: number;
  bt_wr?: number;
  max_streak?: number;
  loss_rate?: number;
  z_score?: number;
}

interface InfoSignal {
  category: string;
  severity: "info" | "notable" | "warning";
  title: string;
  detail: string;
  metric_value: number | null;
}

interface InfoReport {
  headline: string;
  conflict_detected: boolean;
  phase: "waiting" | "calibrating" | "active";
  signals: InfoSignal[];
}

interface BayesData {
  strategy_id: string;
  total_trades: number;
  bt_ev: number;
  bt_trades: number;
  live_ev: number | null;
  live_trades_total: number;
  decomposition: EVDecomposition | null;
  risk_gauges: Record<string, RiskGauge>;
  fit_types: Record<string, { type: string; name?: string; body?: string; tail?: string; splice_pct?: number }>;
  consistency_tests?: Record<string, ConsistencyTest>;
  info_report?: InfoReport;
}

// --- Helpers ---

function pct(v: number) { return (v * 100).toFixed(1) + "%"; }
function usd(v: number) { return "$" + v.toFixed(2); }

// Box-Muller transform for normal random
function randn(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/** Generate N simulated PnL by sampling from the posterior:
 *  - Win/Loss: Bernoulli(theta_mean)
 *  - Win size:  N(avg_win_mean, σ_win)   — σ from posterior, or CV=50% fallback
 *  - Loss size: N(avg_loss_mean, σ_loss)  — same
 */
function generateSimPnl(d: EVDecomposition, n: number): string {
  const DEFAULT_CV = 0.5; // Fallback when no BT variance available
  const sigmaWin = d.avg_win_var > 0.0001
    ? Math.sqrt(d.avg_win_var)
    : d.avg_win_mean * DEFAULT_CV;
  const sigmaLoss = d.avg_loss_var > 0.0001
    ? Math.sqrt(d.avg_loss_var)
    : d.avg_loss_mean * DEFAULT_CV;

  const trades: number[] = [];
  for (let i = 0; i < n; i++) {
    if (Math.random() < d.theta_mean) {
      const w = d.avg_win_mean + randn() * sigmaWin;
      trades.push(Math.round(Math.max(0.01, w) * 100) / 100);
    } else {
      const l = d.avg_loss_mean + randn() * sigmaLoss;
      trades.push(-Math.round(Math.max(0.01, l) * 100) / 100);
    }
  }
  return trades.join(", ");
}


// --- Main Component ---

export const MachineLearningView = ({ context }: { context: DashboardContext }) => {
  const { activeAsset, liveEquity, liveEquityVersion } = context;
  const tWorkspace = useTranslations("workspaceManager");
  const tMath = useTranslations("bayesMath");
  const tV = useTranslations("verdict");
  const tR = useTranslations("riskReport");
  const tH = useTranslations("humanizer");
  const selectedId = activeAsset?.id ?? "";
  const isPortfolio = activeAsset ? "strategy_ids" in activeAsset : false;
  const [data, setData] = useState<BayesData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hardcoded Controls for Dashboard View (no UI sliders)
  const minTradesCi = 30;
  const ciConfidence = 0.95;
  const maxBtTrades = 30;
  const simPnl = "";

  const METRICS = [
    { key: "max_drawdown",       label: tWorkspace("gaugeNames.max_drawdown" as any) },
    { key: "daily_loss",         label: tWorkspace("gaugeNames.daily_loss" as any) },
    { key: "stagnation_days",    label: tWorkspace("gaugeNames.stagnation_days" as any) },
    { key: "stagnation_trades",  label: tWorkspace("gaugeNames.stagnation_trades" as any) },
    { key: "consecutive_losses", label: tWorkspace("gaugeNames.consecutive_losses" as any) },
  ];



  const fetchBayes = async (overrideBtDiscount?: number, overrideCiConf?: number, overrideMinTrades?: number) => {
    if (!selectedId) return;
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const params: any = {};
      if (simPnl) {
          params.sim_pnl = simPnl;
      }
      const res = isPortfolio
        ? await portfolioAPI.getBayes(selectedId, params)
        : await strategyAPI.getBayes(selectedId, params);
      setData(res.data);
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Request failed");
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!selectedId) return;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError(null);
      // Removed setData(null) here because it causes flickering during simulated typing,
      // but it's safe to clear if no simPnl is present.
      if (!simPnl) {
         setData(null);
      }
      try {
        const params: any = {};
        if (simPnl) {
            params.sim_pnl = simPnl;
        }
        const res = isPortfolio
          ? await portfolioAPI.getBayes(selectedId, params)
          : await strategyAPI.getBayes(selectedId, params);
        setData(res.data);
      } catch (err: any) {
        setError(err?.response?.data?.detail || "Request failed");
      }
      setLoading(false);
    }, simPnl ? 600 : 0);  // debounce only for sim typing
    return () => clearTimeout(timer);
  }, [selectedId, ciConfidence, minTradesCi, simPnl, liveEquityVersion]);


  const d = data?.decomposition;

  const mainColor = d
    ? d.p_positive > 0.8 ? "text-risk-green"
      : d.p_positive > 0.5 ? "text-amber-400"
      : "text-risk-red"
    : "text-iron-400";

  return (
    <div className="space-y-4 p-2 sm:p-6 max-w-4xl mx-auto min-w-0 w-full">
      {/* Header */}
      <div className="flex items-center gap-2">
        <span className="text-2xl">🧠</span>
        <div>
          <h1 className="text-xl font-bold text-iron-100">{tMath("ui.title")}</h1>
          <p className="text-xs text-iron-500">{tMath("ui.subtitle")}</p>
        </div>
      </div>

        <div className="lg:col-span-3 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="flex items-center gap-2 sm:gap-4 flex-wrap">
              <p className="text-iron-400 text-sm truncate">{tMath("ui.analyzing")} <span className="font-mono text-iron-200">{activeAsset?.name}</span></p>
              <div className="flex gap-2">
                 <div className="bg-surface-tertiary px-2 py-0.5 rounded-md border border-iron-800 flex items-center gap-1.5">
                    <span className="text-[9px] text-iron-400">Backtest:</span>
                    <span className="font-mono text-[10px] text-iron-200 font-bold">{data?.total_trades ?? activeAsset?.total_trades ?? 0}</span>
                 </div>
                 <div className="bg-surface-tertiary px-2 py-0.5 rounded-md border border-cyan-900/30 flex items-center gap-1.5">
                    <span className="text-[9px] text-cyan-700 font-semibold">{tWorkspace("liveBadge")}:</span>
                    <span className="font-mono text-[10px] text-cyan-400 font-bold">{data?.live_trades_total ?? liveEquity?.trades ?? 0}</span>
                 </div>
              </div>
             </div>
            {loading && <span className="text-amber-400 text-xs animate-pulse">{tMath("ui.calculating")}</span>}
          </div>

          {d ? (
            <>
               {/* Veredicto Maestro de Riesgo — Humanized */}
               {(data?.info_report || data?.risk_gauges) && (() => {
                 const phase = data?.info_report?.phase || 'active';

                 // --- EARLY PHASE: show informational badge, not the traffic light ---
                 if (phase === 'waiting' || phase === 'calibrating') {
                   const isWaiting = phase === 'waiting';
                   return (
                     <div className="bg-iron-900 border border-iron-800 rounded-xl p-3 sm:p-4 flex flex-col sm:flex-row items-center sm:items-start gap-4 shadow-xl mb-4 min-w-0 w-full overflow-hidden">
                       <div className="flex flex-col justify-center items-center p-3 rounded-xl min-w-[120px] border border-blue-500/30 bg-blue-500/10">
                         <div className="text-4xl mb-1 text-blue-400">{isWaiting ? '⏳' : '📡'}</div>
                         <div className="font-mono font-bold tracking-widest text-sm text-blue-400">
                           {isWaiting ? 'ESPERANDO' : 'CALIBRANDO'}
                         </div>
                       </div>
                       <div className="flex-1 min-w-0">
                         <h3 className="text-iron-200 font-bold text-sm mb-1">{tV('masterTitle')}</h3>
                         <p className="text-sm font-medium text-blue-300 leading-relaxed mb-2">
                           {isWaiting
                             ? 'Sin datos live. Solo se muestra la proyección del backtest.'
                             : `Calibrando — ${data?.live_trades_total ?? 0} trades live. Los indicadores aún no tienen potencia estadística.`
                           }
                         </p>
                         <p className="text-[11px] text-iron-500 italic leading-relaxed">
                           {isWaiting
                             ? 'Necesitas operar al menos 10 trades para que el motor pueda emitir un veredicto con fundamento estadístico.'
                             : `Faltan ${Math.max(0, 10 - (data?.live_trades_total ?? 0))} trades más para activar el semáforo completo. Puede ser variación normal con cada operación.`
                           }
                         </p>
                       </div>
                     </div>
                   );
                 }

                 // --- ACTIVE PHASE: full traffic light ---
                 const humanizer = new Humanizer(tH, tV);

                 let hasFatal = false;
                 let hasRed = data.info_report?.signals.some((s: any) => s.severity === 'warning') || false;
                 let hasAmber = data.info_report?.signals.some((s: any) => s.severity === 'notable') || false;

                 // Collect gauge data for humanizer
                 const gaugeEntries: Array<{ key: string; gauge: any; gv: any }> = [];
                 if (data.risk_gauges) {
                   Object.entries(data.risk_gauges).forEach(([key, gauge]: [string, any]) => {
                     const gv = getVerdictStyle(gauge.status as VerdictStatus);
                     gaugeEntries.push({ key, gauge, gv });
                     if (gauge.status === 'fatal') hasFatal = true;
                     else if (gauge.status === 'red') hasRed = true;
                     else if (gauge.status === 'amber') hasAmber = true;
                   });
                 }

                 const status: VerdictStatus = hasFatal ? 'fatal' : hasRed ? 'red' : hasAmber ? 'amber' : 'green';
                 const v = getVerdictStyle(status);

                 // Humanized signals (only non-green)
                 const humanSignals = data.risk_gauges
                   ? humanizer.whatIsHappening(data.risk_gauges as Record<string, RiskGaugeData>)
                   : [];

                 return (
                 <div className="bg-iron-900 border border-iron-800 rounded-xl p-3 sm:p-4 flex flex-col sm:flex-row items-center sm:items-start gap-4 shadow-xl mb-4 min-w-0 w-full overflow-hidden">
                   {/* Badge */}
                   <div className={`flex flex-col justify-center items-center p-3 rounded-xl min-w-[120px] border ${v.bgColor}`}>
                     <div className={`text-4xl mb-1 ${v.iconClass}`}>{v.icon}</div>
                     <div className={`font-mono font-bold tracking-widest text-sm ${v.labelClass}`}>{tV(v.labelKey as any)}</div>
                   </div>

                   {/* Content */}
                   <div className="flex-1 min-w-0">
                     {/* Title row */}
                     <div className="flex items-center gap-2 mb-2">
                       <h3 className="text-iron-200 font-bold text-sm">{tV('masterTitle')}</h3>
                       <InfoPopover
                         content={
                           <div className="space-y-3 p-1">
                             {['green', 'amber', 'red', 'fatal'].reverse().map((statusKey) => {
                               const s = getVerdictStyle(statusKey as VerdictStatus);
                               return (
                                 <div key={statusKey} className="flex gap-2 text-[11px] items-start">
                                   <span className={`text-[14px] mt-0.5 ${s.iconClass}`}>{s.icon}</span>
                                   <div>
                                     <span className={`font-mono font-bold ${s.labelClass}`}>{tV(s.labelKey as any)}</span>
                                     <p className="text-iron-400 mt-0.5 leading-tight">{tV(s.descKey as any)}</p>
                                   </div>
                                 </div>
                               );
                             })}
                           </div>
                         }
                         width="w-64"
                         position="bottom"
                       >
                         <span className="text-[10px] text-iron-500 hover:text-iron-300 cursor-pointer transition-colors bg-iron-800/50 rounded-full w-4 h-4 flex items-center justify-center">?</span>
                       </InfoPopover>
                     </div>

                     {/* Human headline — the main takeaway */}
                     <p className={`text-sm font-medium leading-relaxed mb-2 ${v.textColor}`}>
                       {humanizer.verdictHeadline(status)}
                     </p>

                     {/* What's happening — only if non-green signals exist */}
                     {humanSignals.length > 0 && (
                       <div className="mb-3">
                         <div className="text-[10px] text-iron-500 font-semibold uppercase tracking-wider mb-1.5">
                           ⚠️ {tV('whatIsHappening')}
                         </div>
                         <div className="space-y-1">
                           {humanSignals.map((sig, i) => {
                             const sigV = getVerdictStyle(sig.status as VerdictStatus);
                             return (
                               <div key={`h-${i}`} className="flex items-start gap-2 text-[11px] text-iron-300">
                                 <span className={`shrink-0 mt-0.5 ${sigV.iconClass}`}>{sigV.icon}</span>
                                 <span>{sig.narrative}</span>
                               </div>
                             );
                           })}
                         </div>
                       </div>
                     )}

                     {/* Guidance — contextual, declarative */}
                     <p className="text-[11px] text-iron-500 italic leading-relaxed">
                       {humanizer.verdictGuidance(status)}
                     </p>

                     {/* Technical details — collapsible, second plane */}
                     {(gaugeEntries.some(g => g.gauge.status !== 'green') || (data.info_report?.signals?.length ?? 0) > 0) && (
                       <details className="mt-3">
                         <summary className="cursor-pointer text-[10px] text-iron-600 hover:text-iron-400 select-none transition-colors">
                           ▶ {tV('technicalDetails')}
                         </summary>
                         <div className="mt-2 space-y-1 text-[11px] text-iron-400">
                           {gaugeEntries.filter(g => g.gauge.status !== 'green').map(({ key, gauge, gv }, i) => {
                             const name = tR(`gaugeNames.${key}` as any) || key;
                             const val = metricFormatter.format(key, gauge.current);
                             let extra = '';
                             if (gauge.limit && gauge.limit > 0) {
                               extra = ` — ${tMath("ui.gaugePctLim", { pct: ((gauge.current / gauge.limit) * 100).toFixed(1), limit: metricFormatter.format(key, gauge.limit) })}`;
                             }
                             const detail = gauge.status === 'fatal'
                               ? `${name}: ${tV('limitBreached')} (${val})${extra}`
                               : `${name} P${Math.round(gauge.percentile)} (${val})${extra}`;
                             return (
                               <div key={`td-${i}`} className="flex items-center gap-2">
                                 <div className="w-1.5 h-1.5 rounded-full bg-iron-600 shrink-0"></div>
                                 <span>{gv.icon} {tV('empiricalRisk')}: {detail}</span>
                               </div>
                             );
                           })}
                           {data.info_report?.signals.map((s: any, i: number) => {
                             const sIcon = s.severity === 'warning' ? '🔴' : s.severity === 'notable' ? '🟡' : '🟢';
                             let msg = s.detail;
                             if (s.i18n_key && s.i18n_params) {
                               const params = { ...s.i18n_params };
                               if (params.labelKey) {
                                 const labelKeyMap: Record<string, string> = { winRate: 'winRateLabel', streak: 'streakLabel', avgPnl: 'avgPnlLabel', pnl: 'avgPnlLabel' };
                                 params.label = tR(labelKeyMap[params.labelKey] as any ?? params.labelKey);
                               }
                               msg = tR(s.i18n_key as any, params);
                             }
                             return (
                               <div key={`s-${i}`} className="flex items-start gap-2">
                                 <div className="w-1.5 h-1.5 rounded-full bg-iron-600 shrink-0 mt-1.5"></div>
                                 <span>{sIcon} {msg}</span>
                               </div>
                             );
                           })}
                         </div>
                       </details>
                     )}

                     {/* Ulysses Pact breach block */}
                     {hasFatal && (
                       <div className="mt-4 p-3 bg-red-500/5 border-l-2 border-red-500 rounded-r-lg">
                         <h4 className="text-sm font-bold text-red-500 mb-1 flex items-center gap-2">⚠️ {tV('ulyssesBreachTitle')}</h4>
                         <p className="text-xs text-red-400/80 leading-relaxed">{tV('ulyssesBreachDesc')}</p>
                       </div>
                     )}
                   </div>
                 </div>
                 );
               })()}

               {/* Blind Risk Card — protagonist metric */}
               <div className="bg-surface-secondary border border-iron-700 rounded-xl p-3 sm:p-6 space-y-4 min-w-0 w-full overflow-hidden">
                 {/* Blind Risk as main gauge */}
                 {(() => {
                   const blindRiskHumanizer = new Humanizer(tH, tV);
                   const { pct: blindPct, zone, style } = resolveBlindRisk(d.p_positive);
                   const blindPctStr = blindPct.toFixed(1);
                   const { narrative } = blindRiskHumanizer.blindRiskInfo(blindPct);
                   const riskColor = style.textColor;
                   const barColor = style.barGradient;
                   const riskBg = (style.bgAccent || style.borderAccent) ? `${style.bgAccent} ${style.borderAccent}`.trim() : '';
                   return (
                     <div>
                       <div className="flex items-center justify-between mb-3">
                         <div>
                           <h2 className="text-sm font-semibold text-iron-300">{tMath("ui.blindRiskLabel")}</h2>
                         </div>
                         <div className={`text-4xl font-black ${riskColor}`}>
                           {blindPctStr}%
                         </div>
                       </div>
                       <div className="w-full bg-iron-800 rounded-full h-3 overflow-hidden">
                         <div
                           className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                           style={{ width: `${Math.min(blindPct, 100)}%` }}
                         />
                       </div>
                       <div className="flex justify-between text-[9px] text-iron-600 mt-1">
                         <span>{tMath("ui.blindRiskLow")}</span>
                         <span>{tMath("ui.blindRiskHigh")}</span>
                       </div>
                       {/* Human narrative for blind risk */}
                       <div className={`mt-3 px-3 py-2 rounded-lg border border-iron-800/50 ${riskBg} transition-all`}>
                         <p className={`text-xs ${riskColor} leading-relaxed`}>{narrative}</p>
                       </div>
                       {/* P(EV>0) as secondary complement */}
                       <div className="mt-2 flex items-center justify-between text-[10px] text-iron-500">
                         <span>{tMath("ui.probEdgePositive")}</span>
                         <span className={`font-mono font-bold ${mainColor}`}>{(d.p_positive * 100).toFixed(1)}%</span>
                       </div>
                     </div>
                   );
                 })()}
                </div>

               {/* Consistency Tests + Technical Details Card */}
               <div className="bg-surface-secondary border border-iron-700 rounded-xl p-3 sm:p-6 space-y-4 min-w-0 w-full overflow-hidden">
                  <h3 className="text-sm font-semibold text-iron-300 mb-2 flex items-center gap-2">{tMath("ui.guardianTitle")}</h3>
                  <p className="text-xs text-iron-500 mb-3">{tMath("ui.guardianDesc")}</p>
                  
                  {data?.consistency_tests && Object.keys(data.consistency_tests).length > 0 ? (
                    <div className="grid grid-cols-3 gap-2">
                      {Object.entries(data.consistency_tests).map(([key, test]: [string, any]) => {
                        const icon = test.status === "green" ? "🟢" : test.status === "amber" ? "🟡" : "🔴";
                        const msg = test.status === "green" ? tMath("ui.consistent") : test.status === "amber" ? tMath("ui.watch") : tMath("ui.inconsistent");
                        const bgColor = test.status === "green" ? "border-emerald-500/20" : test.status === "amber" ? "border-amber-500/20" : "border-red-500/30 bg-red-500/5";
                        return (
                          <div 
                            key={key} 
                            className={`rounded-lg border p-2 ${bgColor}`}
                            title={`${tMath(`tests.${test.label_key}.title`)}\n${tMath(`tests.${test.label_key}.q`, { k: test.k || 'k', n: test.n || 'n', pct: typeof test.expected === 'string' ? test.expected : 'X%' }).replace('Pregunta: ', '')}`}
                          >
                            <div className="text-xs text-iron-400 mb-1">{test.label}</div>
                            <div className="text-sm font-mono font-bold text-iron-100 mb-2">{icon} {msg}</div>
                            <div className="text-xs text-iron-500 mt-0.5">
                              Live: <span className="text-iron-300">{test.observed}</span>
                            </div>
                            <div className="text-xs text-iron-500 mt-0.5">
                              Backtest: <span className="text-iron-300">{test.expected}</span>
                            </div>
                            <div className="text-xs text-iron-500 mt-0.5">
                              p = <span className={`font-mono font-semibold ${test.status === "red" ? "text-red-400" : test.status === "amber" ? "text-amber-400" : "text-emerald-400"}`}>
                                {(test.p_value * 100).toFixed(1)}%
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {[tMath("tests.emptyState.winRate"), tMath("tests.emptyState.lossStreak"), tMath("tests.emptyState.avgPnl")].map((lbl, idx) => (
                        <div key={`empty-state-${idx}`} className="rounded-lg border border-iron-800 border-dashed bg-iron-900/30 p-2 flex flex-col items-center justify-center min-h-[85px] opacity-60">
                          <div className="text-[10px] text-iron-500 font-semibold mb-1">{lbl}</div>
                          <div className="text-[9px] text-iron-600 text-center px-2">{tMath("tests.emptyState.desc")}</div>
                        </div>
                      ))}
                    </div>
                  )}
                      <details className="mt-4">
                        <summary className="cursor-pointer text-xs text-iron-500 hover:text-iron-300 select-none">
                          ▶ {tMath("tests.howItWorks")}
                        </summary>
                        <div className="mt-3 space-y-3 text-xs text-iron-400 leading-relaxed">
                          <div className="bg-surface-tertiary rounded-lg p-2">
                            <div className="font-semibold text-iron-300 mb-1">{tMath("tests.winRate.title")}</div>
                            <div><em>{tMath("tests.winRate.q", { k: "k", n: "n" })}</em></div>
                            <div className="font-mono mt-1 text-iron-400">p_value = Binomial.CDF(k=wins_live, n=trades_live, p=WinRate_backtest)</div>
                            <div className="mt-1">{tMath("tests.winRate.red")}<br/>{tMath("tests.winRate.yellow")}<br/>{tMath("tests.winRate.green")}</div>
                            {data?.consistency_tests?.win_rate && (
                              <PValueGauge pValue={data.consistency_tests.win_rate.p_value} label={tMath("tests.emptyState.winRate")} />
                            )}
                          </div>
                          <div className="bg-surface-tertiary rounded-lg p-2 space-y-1.5">
                            <div className="font-semibold text-iron-300 mb-1">{tMath("tests.streak.title")}</div>
                            <div><em>{tMath("tests.streak.q", { pct: data?.consistency_tests?.consec_losses?.expected || 'X%' })}</em></div>
                            <div className="mt-1"><strong className="text-iron-300">{tMath("tests.streak.logic")}</strong></div>
                            <div>{tMath("tests.streak.logic1", { pct: data?.consistency_tests?.consec_losses ? `${(100 - parseFloat(data.consistency_tests.consec_losses.expected.replace(/[^0-9.]/g, ''))).toFixed(0)}%` : 'X%' })}</div>
                            <div>{tMath.rich("tests.streak.logic2", { k: (chunks) => <strong>{chunks}</strong> })}</div>
                            {data?.consistency_tests?.consec_losses && (() => {
                              const t = data.consistency_tests.consec_losses!;
                              const k = parseInt(t.observed);
                              const wr = parseFloat(t.expected.replace(/[^0-9.]/g, '')) / 100;
                              const lossRate = 1 - wr;
                              const pRaw = Math.pow(lossRate, k);
                              const windows = Math.max(1, data.live_trades_total - k + 1);
                              const pFinal = Math.min(1, windows * pRaw);
                              return (
                                <div className="bg-iron-800/60 rounded p-1.5 font-mono text-iron-400 space-y-0.5">
                                  <div>{tMath("tests.streak.observed")} <span className="text-iron-200">{k} {tMath("tests.streak.lossesInRow")}</span></div>
                                  <div>{tMath("tests.streak.prob1")} <span className="text-iron-200">{(lossRate*100).toFixed(0)}%</span></div>
                                  <div>{tMath("tests.streak.prob2")} {(lossRate*100).toFixed(0)}% × {(lossRate*100).toFixed(0)}% = <span className="text-iron-200">{(Math.pow(lossRate, 2) * 100).toFixed(1)}%</span></div>
                                  <div>{tMath("tests.streak.probK", { k })} {(lossRate*100).toFixed(0)}%<sup>{k}</sup> = <span className="text-iron-200">{(pRaw * 100).toFixed(3)}%</span> <span className="text-iron-600">{tMath("tests.streak.pureProb")}</span></div>
                                  <div className="border-t border-iron-700 pt-1 mt-1">
                                    {tMath("tests.streak.windows")} {data.live_trades_total} − {k} + 1 = <span className="text-iron-200">{windows}</span>
                                  </div>
                                  <div>
                                    p = {windows} × {(pRaw * 100).toFixed(3)}% = <span className={t.status === 'red' ? 'text-red-400 font-bold' : t.status === 'amber' ? 'text-amber-400' : 'text-iron-200'}>{(pFinal * 100).toFixed(3)}%</span>
                                  </div>
                                </div>
                              );
                            })()}
                            <div>{tMath("tests.streak.red")}<br/>{tMath("tests.streak.yellow")}<br/>{tMath("tests.streak.green")}</div>
                            {data?.consistency_tests?.consec_losses && (
                              <PValueGauge pValue={data.consistency_tests.consec_losses.p_value} label={tMath("tests.streak.label")} />
                            )}
                          </div>
                          <div className="bg-surface-tertiary rounded-lg p-2">
                            <div className="font-semibold text-iron-300 mb-1">{tMath("tests.pnl.title")}</div>
                            <div><em>{tMath("tests.pnl.q")}</em></div>
                            <div className="font-mono mt-1 text-iron-400">z = (avg_live − avg_bt) / (σ_bt / √n)<br/>p_value = Φ(z)</div>
                            <div className="mt-1">{tMath("tests.pnl.compare")}<br/>{tMath("tests.pnl.zscore")}</div>
                            {data?.consistency_tests?.avg_pnl && (
                              <PValueGauge pValue={data.consistency_tests.avg_pnl.p_value} label={tMath("tests.pnl.label")} />
                            )}
                          </div>
                          <div className="bg-iron-800/50 rounded-lg p-2 text-iron-600">
                            <strong className="text-iron-400">{tMath("tests.interpretation.title")}</strong> {tMath("tests.interpretation.desc")}
                          </div>
                        </div>
                      </details>

                {/* Divider */}
                <div className="border-t border-iron-700" />

                {/* IC and Live Equity */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div>
                    <h3 className="text-sm font-semibold text-iron-200">{tMath("charts.evTitle")}</h3>
                    <p className="text-[10px] text-iron-500 mb-3 mr-4">
                      {tMath("charts.evDesc", { pct: (d.confidence*100).toFixed(0) })}
                    </p>
                    <div className="mt-2 pr-2">
                      <GaussianChart
                        lower={d.ev_lower} upper={d.ev_upper} mean={d.ev_mean}
                        std={d.ev_std}
                        label="Expectancy"
                        height={160}
                        hideIcFill
                        shadeAbove={0}
                        shadeAboveColor="#10b981"
                        shadeAboveLabel={`P>0: ${(d.p_positive * 100).toFixed(1)}%`}
                        shadeBelow={0}
                        shadeBelowColor="#ef4444"
                        shadeBelowLabel={`P<0: ${((1 - d.p_positive) * 100).toFixed(1)}%`}
                        refLines={[
                          { x: d.ev_lower, color: "#f59e0b", dashed: true, hideLegend: true },
                          { x: d.ev_upper, color: "#f59e0b", dashed: true, hideLegend: true },
                        ]}
                      />
                    </div>
                  </div>
                  <div className="border-l border-iron-800 pl-6 flex flex-col pt-1 lg:pt-0">
                    <h3 className="text-sm font-semibold text-cyan-400">{tMath("charts.liveTitle")}</h3>
                    <p className="text-[10px] text-iron-500 mb-3">
                      {tMath("charts.liveDesc")}
                    </p>
                    <div className="flex-1 mt-2 relative min-h-[160px] pb-4">
                      {liveEquity && liveEquity.trades > 0 && liveEquity.curve && liveEquity.curve.length > 0 ? (
                        <div className="absolute inset-0">
                          <EquityCurve data={liveEquity.curve} variant="live" />
                        </div>
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center bg-surface-tertiary rounded-lg border border-iron-800 border-dashed">
                          <span className="text-[10px] text-iron-600">{tMath("charts.waitingLiveTrades")}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Divider */}
                <div className="border-t border-iron-700" />

                {/* Collapsible step-by-step breakdown isolated to BayesMathBreakdown component */}
                <BayesMathBreakdown decomposition={d} />
              </div>

              {/* Risk Gauges — Human narratives + technical details */}
              <div className="bg-surface-secondary border border-iron-700 rounded-xl p-4">
                <h3 className="text-xs font-semibold text-iron-300 mb-3">📉 Gauges de Riesgo</h3>
                {data?.risk_gauges && Object.keys(data.risk_gauges).length > 0 ? (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {(() => {
                        const gaugeHumanizer = new Humanizer(tH, tV);
                        return Object.entries(data.risk_gauges).map(([key, gauge]) => {
                          const label = METRICS.find(m => m.key === key)?.label || key;
                          const statusColor = gauge.status === "green" ? "text-risk-green" : gauge.status === "amber" ? "text-amber-400" : "text-risk-red";
                          const statusIcon = gauge.status === "green" ? "✅" : gauge.status === "amber" ? "⚠️" : "🔴";
                          const humanPhrase = gaugeHumanizer.gaugeNarrative(key, gauge as RiskGaugeData);
                          return (
                            <div key={key} className={`bg-surface-tertiary rounded-lg p-3 ${gauge.simulated ? 'border border-amber-500/30' : ''}`}>
                              <div className="text-xs text-iron-400 font-semibold flex items-center gap-1">
                                <MetricTooltip metricKey={`live_${key}`} variant="card">{label}</MetricTooltip>
                                {gauge.simulated && <span className="text-amber-400 text-[10px]" title={tMath("ui.gaugeTooltipSim")}>🧪 sim</span>}
                              </div>
                              <div className="flex items-baseline gap-2">
                                <span className="text-sm font-bold text-iron-200">
                                  {metricFormatter.format(key, gauge.current)}
                                </span>
                              </div>
                              {/* Human narrative — first line */}
                              <p className={`text-[10px] mt-1 leading-snug ${statusColor}`}>
                                {humanPhrase}
                              </p>
                              <div className="w-full bg-iron-800 rounded-full h-1.5 mt-1.5">
                                <div
                                  className={`h-full rounded-full ${
                                    gauge.status === "green" ? "bg-emerald-500" : gauge.status === "amber" ? "bg-amber-500" : "bg-red-500"
                                  }`}
                                  style={{ width: `${Math.min(gauge.percentile, 100)}%` }}
                                />
                              </div>
                              {/* Percentile — second line (visible but secondary) */}
                              <div className="flex items-center justify-between mt-1">
                                <span className={`text-[10px] font-mono ${statusColor}`}>
                                  {statusIcon} P{gauge.percentile.toFixed(0)}
                                </span>
                                {gauge.limit && gauge.limit > 0 && (
                                  <span className="text-[10px] text-iron-500 font-mono" title={tMath("ui.gaugeTooltipLim")}>
                                    {tMath("ui.gaugePctLim", { 
                                      pct: ((gauge.current / gauge.limit) * 100).toFixed(1),
                                      limit: metricFormatter.format(key, gauge.limit)
                                    })}
                                  </span>
                                )}
                              </div>
                            </div>
                          );
                        });
                      })()}
                    </div>
                  </>
                ) : (
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {METRICS.slice(0,3).map(m => (
                      <div key={m.key} className="bg-surface-tertiary rounded-lg p-3 border border-iron-800 border-dashed opacity-50 relative overflow-hidden">
                        <div className="text-[10px] text-iron-500 flex items-center gap-1">{m.label}</div>
                        <div className="flex items-baseline gap-2 mt-1">
                          <span className="text-sm font-bold text-iron-600">--</span>
                        </div>
                        <div className="w-full bg-iron-800 rounded-full h-1.5 mt-1"></div>
                        <div className="absolute inset-0 flex items-center justify-end pr-3">
                           <span className="text-[9px] text-iron-600 bg-surface-tertiary px-1 rounded">Esperando Live</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : data && !d ? (
            <div className="bg-surface-secondary border border-iron-700 rounded-xl p-8 text-center">
              <span className="text-3xl">📊</span>
              <p className="text-iron-400 mt-2">Datos insuficientes para descomposición</p>
              <p className="text-iron-600 text-xs mt-1">Se requieren al menos {minTradesCi} trades</p>
            </div>
          ) : (
            <div className="bg-surface-secondary border border-iron-700 rounded-xl p-8 text-center">
              <span className="text-3xl">📊</span>
              <p className="text-iron-400 mt-2">Selecciona una estrategia en la tabla inferior para analizar</p>
            </div>
          )}
        </div>
      </div>
  );
};
