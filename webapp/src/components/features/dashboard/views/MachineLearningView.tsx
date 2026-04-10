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

// --- Log-Gamma (Lanczos approximation) for Beta PDF ---
function logGamma(z: number): number {
  const g = 7;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

function betaPdf(x: number, a: number, b: number): number {
  if (x <= 0 || x >= 1) return 0;
  const logB = logGamma(a) + logGamma(b) - logGamma(a + b);
  return Math.exp((a - 1) * Math.log(x) + (b - 1) * Math.log(1 - x) - logB);
}

function BetaDistChart({ priorA, priorB, postA, postB, icLower, icUpper }: {
  priorA: number; priorB: number; postA: number; postB: number;
  icLower: number; icUpper: number;
}) {
  const data = useMemo(() => {
    const pts: { x: number; prior: number; posterior: number; ic: number | null }[] = [];
    for (let i = 1; i < 200; i++) {
      const x = i / 200;
      const postY = betaPdf(x, postA, postB);
      pts.push({
        x,
        prior: betaPdf(x, priorA, priorB),
        posterior: postY,
        ic: (x >= icLower && x <= icUpper) ? postY : null,
      });
    }
    return pts;
  }, [priorA, priorB, postA, postB, icLower, icUpper]);

  const priorMean = priorA / (priorA + priorB);
  const postMean = postA / (postA + postB);
  const delta = postMean - priorMean;
  const improved = delta > 0.001;
  const worsened = delta < -0.001;

  return (
    <div className="w-full mt-2">
      <div className="h-[160px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <XAxis dataKey="x" type="number" domain={[0, 1]} tick={{ fill: "#78828f", fontSize: 9 }}
              tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`} />
            <YAxis hide />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const x = payload[0]?.payload?.x;
                return (
                  <div className="bg-[#1e2228] border border-[#3e444f] rounded-lg px-3 py-2 text-[11px]">
                    <div className="text-iron-400">Win Rate: <span className="text-white font-mono">{(x * 100).toFixed(1)}%</span></div>
                    <div className="text-amber-400">Prior: <span className="font-mono">{payload[0]?.payload?.prior?.toFixed(3)}</span></div>
                    <div className="text-[#00aaff]">Posterior: <span className="font-mono">{payload[0]?.payload?.posterior?.toFixed(3)}</span></div>
                  </div>
                );
              }}
            />
            <Area type="monotone" dataKey="prior" stroke="#f59e0b" strokeWidth={1.5}
              strokeDasharray="4 3" fill="transparent" dot={false} isAnimationActive={false} />
            <Area type="monotone" dataKey="posterior" stroke="#00aaff" strokeWidth={2}
              fill="transparent" dot={false} isAnimationActive={false} />
            <Area type="monotone" dataKey="ic" stroke="none"
              fill="#10b981" fillOpacity={0.3} dot={false} isAnimationActive={false}
              connectNulls={false} />
            <ReferenceLine x={priorMean} stroke="#f59e0b" strokeDasharray="3 3" strokeWidth={1} />
            <ReferenceLine x={postMean} stroke="#00aaff" strokeWidth={1.5} />
            <ReferenceLine x={icLower} stroke="#10b981" strokeDasharray="2 2" strokeWidth={0.8} />
            <ReferenceLine x={icUpper} stroke="#10b981" strokeDasharray="2 2" strokeWidth={0.8} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center justify-between mt-2">
        <div className="flex gap-3 text-[9px]">
          <span className="text-amber-400">--- Prior (solo BT)</span>
          <span className="text-[#00aaff]">— Posterior (BT + Live)</span>
          <span className="text-emerald-500">█ IC 95%</span>
        </div>
        <div className={`text-[11px] font-semibold flex items-center gap-1 ${
          improved ? "text-risk-green" : worsened ? "text-risk-red" : "text-iron-400"
        }`}>
          <span className="text-amber-400 font-mono text-[10px]">{(priorMean * 100).toFixed(1)}%</span>
          <span className="text-iron-500">{improved ? "→" : worsened ? "→" : "="}</span>
          <span className="text-[#00aaff] font-mono text-[10px]">{(postMean * 100).toFixed(1)}%</span>
          <span className={`ml-1 ${improved ? "text-risk-green" : worsened ? "text-risk-red" : "text-iron-500"}`}>
            {improved ? `▲ +${(delta * 100).toFixed(1)}pp` : worsened ? `▼ ${(delta * 100).toFixed(1)}pp` : "sin cambio"}
          </span>
          <span className="text-[10px]">
            {improved ? "✅ Mejorado" : worsened ? "⚠️ Empeorado" : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}

// --- Reusable Gaussian Distribution Chart (OOP-style) ---

interface GaussianChartConfig {
  mean: number;
  std: number;
  lower: number;       // IC lower
  upper: number;       // IC upper
  label?: string;      // e.g. "E(X)", "W", "L"
  color?: string;      // accent color, default #00aaff
  fillColor?: string;  // IC fill, defaults to color
  zeroLine?: boolean;  // show zero reference line
  refLines?: { x: number; color: string; label?: string; dashed?: boolean; hideLegend?: boolean }[];
  format?: "usd" | "pct";
  height?: number;
  shadeAbove?: number; // shade area >= this x value (e.g. 0 for P(EV>0))
  shadeAboveColor?: string;
  shadeAboveLabel?: string;
  shadeBelow?: number; // shade area < this x value (e.g. 0 for loss zone)
  shadeBelowColor?: string;
  shadeBelowLabel?: string;
  hideIcFill?: boolean; // hide IC band fill (useful when shadeAbove/Below is active)
}

function normalPdf(x: number, mu: number, sigma: number): number {
  const z = (x - mu) / sigma;
  return Math.exp(-0.5 * z * z) / (sigma * Math.sqrt(2 * Math.PI));
}

function GaussianChart({
  mean, std, lower, upper,
  label = "E(X)", color = "#00aaff", fillColor,
  zeroLine = true, refLines = [],
  format = "usd", height = 140,
  shadeAbove, shadeAboveColor = "#10b981", shadeAboveLabel,
  shadeBelow, shadeBelowColor = "#ef4444", shadeBelowLabel,
  hideIcFill = false,
}: GaussianChartConfig) {
  const fill = fillColor ?? color;
  const fmt = (v: number) => format === "pct" ? (v * 100).toFixed(1) + "%" : "$" + v.toFixed(2);

  const data = useMemo(() => {
    const lo = mean - 4 * std;
    const hi = mean + 4 * std;
    const pts: any[] = [];
    const n = 200;
    let accumulatedArea = 0;
    const step = (hi - lo) / n;
    
    for (let i = 0; i <= n; i++) {
      const x = lo + step * i;
      const y = normalPdf(x, mean, std);
      
      // Numerical integration for CDF
      accumulatedArea += y * step;
      
      pts.push({
        x: Math.round(x * 100) / 100,
        density: y,
        ic: (x >= lower && x <= upper) ? y : null,
        positive: (shadeAbove !== undefined && x >= shadeAbove) ? y : null,
        negative: (shadeBelow !== undefined && x < shadeBelow) ? y : null,
        probLeft: Math.min(accumulatedArea, 1), // Clamp to 1 just in case
      });
    }
    return pts;
  }, [mean, std, lower, upper, shadeAbove, shadeBelow]);

  const xMin = mean - 4 * std;
  const xMax = mean + 4 * std;
  const includesZero = lower <= 0 && upper >= 0;

  // Build explicit ticks for all key values
  const keyTicks = useMemo(() => {
    const ticks: number[] = [lower, mean, upper];
    if (zeroLine && 0 > xMin && 0 < xMax) ticks.push(0);
    refLines.forEach(r => { if (r.x > xMin && r.x < xMax) ticks.push(r.x); });
    // De-duplicate ticks that are too close (within 2% of range)
    const range = xMax - xMin;
    const minGap = range * 0.02;
    const sorted = [...new Set(ticks)].sort((a, b) => a - b);
    const filtered: number[] = [];
    for (const t of sorted) {
      if (filtered.length === 0 || Math.abs(t - filtered[filtered.length - 1]) > minGap) {
        filtered.push(t);
      }
    }
    return filtered;
  }, [lower, upper, mean, xMin, xMax, zeroLine, refLines]);

  return (
    <div className="w-full mt-1">
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <XAxis dataKey="x" type="number" domain={[xMin, xMax]}
              ticks={keyTicks}
              tick={{ fill: "#78828f", fontSize: 9 }}
              tickFormatter={(v: number) => fmt(v)} />
            <YAxis hide />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0]?.payload;
                if (!p) return null;
                
                const probLeft = p.probLeft * 100;
                const probRight = Math.max(0, 100 - probLeft);
                
                return (
                  <div className="bg-[#1e2228] border border-[#3e444f] rounded-lg px-3 py-2 text-[11px] min-w-[140px]">
                    <div className="text-iron-400 border-b border-[#3e444f] pb-1 mb-1">{label}: <span className="text-white font-mono">{fmt(p.x)}</span></div>
                    <div className="flex justify-between items-center gap-3">
                      <span className="text-iron-500">P(Peor):</span>
                      <span className="font-mono text-risk-red">{probLeft.toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between items-center gap-3 mt-0.5">
                      <span className="text-iron-500">P(Mejor):</span>
                      <span className="font-mono text-risk-green">{probRight.toFixed(1)}%</span>
                    </div>
                  </div>
                );
              }}
            />
            <Area type="monotone" dataKey="density" stroke={color} strokeWidth={1.5}
              fill="transparent" dot={false} isAnimationActive={false} />
            {!hideIcFill && (
              <Area type="monotone" dataKey="ic" stroke="none"
                fill={fill} fillOpacity={0.25} dot={false} isAnimationActive={false}
                connectNulls={false} />
            )}
            {shadeAbove !== undefined && (
              <Area type="monotone" dataKey="positive" stroke="none"
                fill={shadeAboveColor} fillOpacity={0.35} dot={false} isAnimationActive={false}
                connectNulls={false} />
            )}
            {shadeBelow !== undefined && (
              <Area type="monotone" dataKey="negative" stroke="none"
                fill={shadeBelowColor} fillOpacity={0.2} dot={false} isAnimationActive={false}
                connectNulls={false} />
            )}
            {/* Zero line */}
            {zeroLine && (
              <ReferenceLine x={0} stroke={includesZero ? "#ef4444" : "#3e444f"} strokeWidth={includesZero ? 2 : 1}
                strokeDasharray={includesZero ? undefined : "3 3"} />
            )}
            {/* Mean line */}
            <ReferenceLine x={mean} stroke="#00ffaa" strokeWidth={1.5} />
            {/* Custom ref lines */}
            {refLines.map((r, i) => (
              <ReferenceLine key={i} x={r.x} stroke={r.color} strokeWidth={1.5}
                strokeDasharray={r.dashed ? "4 4" : undefined} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-start justify-between flex-wrap gap-2 mt-3 text-xs">
        <div className="flex flex-wrap items-center gap-4">
          <span style={{ color }}>— Distribución</span>
          {!hideIcFill && (
            <span style={{ color, opacity: 0.6 }}>█ IC [{fmt(lower)}, {fmt(upper)}]</span>
          )}
          {hideIcFill && (
            <span style={{ color: "#f59e0b" }}>┊ IC [{fmt(lower)}, {fmt(upper)}]</span>
          )}
          {zeroLine && (
            <span className={includesZero ? "text-red-400" : "text-iron-500"}>| Línea del 0</span>
          )}
          {shadeAbove !== undefined && shadeAboveLabel && (
            <span style={{ color: shadeAboveColor }}>█ {shadeAboveLabel}</span>
          )}
          {shadeBelow !== undefined && shadeBelowLabel && (
            <span style={{ color: shadeBelowColor, opacity: 0.6 }}>█ {shadeBelowLabel}</span>
          )}
          {refLines.filter(r => !r.hideLegend).map((r, i) => (
            <span key={i} style={{ color: r.color }}>{r.dashed ? "┊" : "|"} {r.label ?? fmt(r.x)}</span>
          ))}
        </div>
        <span className="text-[#00ffaa] font-mono">{label} = {fmt(mean)}</span>
      </div>
    </div>
  );
}

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
  ev_mean: number; ev_std: number;
  ev_lower: number; ev_upper: number;
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
    { key: "max_drawdown", label: "Drawdown" },
    { key: "daily_loss", label: "Daily Loss" },
    { key: "stagnation_days", label: "Estancamiento (días)" },
    { key: "stagnation_trades", label: "Estancamiento (trades)" },
    { key: "consecutive_losses", label: "Rachas Perdedoras" },
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
    <div className="space-y-6 p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="text-2xl">🧠</span>
        <div>
          <h1 className="text-xl font-bold text-iron-100">{tMath("ui.title")}</h1>
          <p className="text-xs text-iron-500">{tMath("ui.subtitle")}</p>
        </div>
      </div>

        <div className="lg:col-span-3 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <p className="text-iron-400 text-sm">{tMath("ui.analyzing")} <span className="font-mono text-iron-200">{activeAsset?.name}</span></p>
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
              {/* Veredicto Maestro de Riesgo */}
              {(data?.info_report || data?.risk_gauges) && (
                <div className="bg-iron-900 border border-iron-800 rounded-xl p-4 flex items-center gap-4 shadow-xl mb-4">
                  {(() => {
                    let hasFatal = false;
                    let hasRed = data.info_report?.signals.some(s => s.severity === 'warning') || false;
                    let hasAmber = data.info_report?.signals.some(s => s.severity === 'notable') || false;
                    
                    const gaugeReasons: { icon: string, text: string }[] = [];


                    if (data.risk_gauges) {
                      Object.entries(data.risk_gauges).forEach(([key, gauge]: [string, any]) => {
                        const name = tR(`gaugeNames.${key}` as any) || key;
                        const val = metricFormatter.format(key, gauge.current);
                        const gv = getVerdictStyle(gauge.status as VerdictStatus);
                        let extra = '';
                        if (gauge.limit && gauge.limit > 0) {
                           extra = ` - ${tMath("ui.gaugePctLim", { pct: ((gauge.current / gauge.limit) * 100).toFixed(1), limit: metricFormatter.format(key, gauge.limit) })}`;
                        }

                        if (gauge.status === 'fatal') {
                          hasFatal = true;
                          gaugeReasons.push({ icon: gv.icon, text: `${name}: ${tV('limitBreached')} (${val})${extra}` });
                        } else if (gauge.status === 'red') {
                          hasRed = true;
                          gaugeReasons.push({ icon: gv.icon, text: `${name} P${Math.round(gauge.percentile)} (${val})${extra}` });
                        } else if (gauge.status === 'amber') {
                          hasAmber = true;
                          gaugeReasons.push({ icon: gv.icon, text: `${name} P${Math.round(gauge.percentile)} (${val})${extra}` });
                        }
                      });
                    }

                    const status = hasFatal ? 'fatal' : hasRed ? 'red' : hasAmber ? 'amber' : 'green';
                    const v = getVerdictStyle(status as VerdictStatus);
                    
                    return (
                      <>
                        <div className={`flex flex-col justify-center items-center p-3 rounded-xl min-w-[120px] border ${v.bgColor}`}>
                          <div className={`text-4xl mb-1 ${v.iconClass}`}>{v.icon}</div>
                          <div className={`font-mono font-bold tracking-widest text-sm ${v.labelClass}`}>{tV(v.labelKey as any)}</div>
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
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
                          <div className="text-[11px] text-iron-400 space-y-1">
                            {gaugeReasons.map((g, i) => (
                              <div key={`g-${i}`} className="flex items-center gap-2 max-w-2xl">
                                <div className="w-1.5 h-1.5 rounded-full bg-iron-600 shrink-0"></div>
                                <span>{g.icon} {tV('empiricalRisk')}: {g.text}</span>
                              </div>
                            ))}
                            {data.info_report?.signals.map((s: any, i: number) => {
                              const sIcon = s.severity === 'warning' ? '🔴' : s.severity === 'notable' ? '🟡' : '🟢';
                              let msg = s.detail;
                              if (s.i18n_key && s.i18n_params) {
                                const params = { ...s.i18n_params };
                                // Resolve label from labelKey (e.g. "streak" → "Loss Streak" / "Racha Pérdidas")
                                if (params.labelKey) {
                                  const labelKeyMap: Record<string, string> = { winRate: 'winRateLabel', streak: 'streakLabel', avgPnl: 'avgPnlLabel', pnl: 'avgPnlLabel' };
                                  params.label = tR(labelKeyMap[params.labelKey] as any ?? params.labelKey);
                                }
                                msg = tR(s.i18n_key as any, params);
                              }
                              return (
                                <div key={`s-${i}`} className="flex items-start gap-2 max-w-2xl">
                                  <div className="w-1.5 h-1.5 rounded-full bg-iron-600 shrink-0 mt-1.5"></div>
                                  <span>{sIcon} {msg}</span>
                                </div>
                              );
                            })}
                            {(!data.info_report || data.info_report.signals.length === 0) && gaugeReasons.length === 0 && d && (() => {
                                const blindRisk = 1 - d.p_positive;
                                const pct = (blindRisk * 100).toFixed(1);
                                const isLow = blindRisk < 0.2;
                                const isMid = blindRisk >= 0.2 && blindRisk < 0.5;
                                const icon = isLow ? "🟢" : isMid ? "🟡" : "🔴";
                                const dotColor = isLow ? "bg-emerald-500" : isMid ? "bg-amber-500" : "bg-red-500";
                                const key = isLow ? "blindRiskLow" : "blindRiskSignal";
                                return (
                                  <div className="flex items-center gap-2">
                                    <div className={`w-1.5 h-1.5 rounded-full ${dotColor}`}></div>
                                    <span>{icon} {tV(key, { pct })}</span>
                                  </div>
                                );
                            })()}
                          </div>
                          {hasFatal && (
                            <div className="mt-4 p-3 bg-red-500/5 border-l-2 border-red-500 rounded-r-lg">
                              <h4 className="text-sm font-bold text-red-500 mb-1 flex items-center gap-2">⚠️ {tV('ulyssesBreachTitle')}</h4>
                              <p className="text-xs text-red-400/80 leading-relaxed">{tV('ulyssesBreachDesc')}</p>
                            </div>
                          )}
                        </div>
                      </>
                    )
                  })()}
                </div>
              )}

              {/* Unified P(EV > 0) Card */}
              <div className="bg-surface-secondary border border-iron-700 rounded-xl p-6 space-y-5">
                {/* Gauge */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h2 className="text-sm font-semibold text-iron-300">P(Expectancy &gt; 0)</h2>
                      <p className="text-[10px] text-iron-600">{tMath("ui.probEdgePositive")}</p>
                    </div>
                    <div className={`text-4xl font-black ${mainColor}`}>
                      {(d.p_positive * 100).toFixed(1)}%
                    </div>
                  </div>
                  <div className="w-full bg-iron-800 rounded-full h-3 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        d.p_positive > 0.8 ? "bg-gradient-to-r from-emerald-600 to-emerald-400"
                        : d.p_positive > 0.5 ? "bg-gradient-to-r from-amber-600 to-amber-400"
                        : "bg-gradient-to-r from-red-700 to-red-500"
                      }`}
                      style={{ width: `${d.p_positive * 100}%` }}
                    />
                  </div>
                  <div className="flex justify-between text-[9px] text-iron-600 mt-1">
                    <span>{tMath("ui.edgeDead")}</span>
                    <span>{tMath("ui.edgeConfirmed")}</span>
                  </div>
                  {/* Blind Risk — contextual 1-P indicator */}
                  {(() => {
                    const blindRisk = 1 - d.p_positive;
                    const blindPct = (blindRisk * 100).toFixed(1);
                    const isLow = blindRisk < 0.2;
                    const isMedium = blindRisk >= 0.2 && blindRisk < 0.5;
                    const isCritical = blindRisk >= 0.5;
                    const riskColor = isLow ? "text-iron-500" : isMedium ? "text-amber-400" : "text-risk-red";
                    const riskBg = isLow ? "bg-iron-800/30" : isMedium ? "bg-amber-500/5 border-amber-500/20" : "bg-red-500/5 border-red-500/20";
                    return (
                      <div className={`mt-3 flex items-center justify-between px-3 py-2 rounded-lg border border-iron-800/50 ${riskBg} transition-all`}>
                        <div className="flex items-center gap-2">
                          <span className="text-[10px]">{isCritical ? "🔴" : isMedium ? "🟡" : "⚪"}</span>
                          <span className="text-[10px] text-iron-500 font-medium">
                            {tMath("ui.blindRiskLabel")}
                          </span>
                        </div>
                        <span className={`font-mono font-bold text-sm ${riskColor}`}>{blindPct}%</span>
                      </div>
                    );
                  })()}
                </div>

                {/* Consistency Tests Strip */}
                <div className="border-t border-iron-700" />
                <div>
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
                    </div>

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

                {/* Collapsible step-by-step breakdown */}
                <details className="group">
                  <summary className="cursor-pointer text-xs text-[#00aaff] hover:text-[#00ccff] font-semibold flex items-center gap-1.5 select-none">
                    <span className="transition-transform group-open:rotate-90">▶</span>
                    📐 {tMath("title")}
                  </summary>
                  <div className="mt-3 space-y-4 border-l-2 border-iron-700 pl-4">

                    {/* Variable glossary */}
                    <div className="bg-iron-800/60 rounded-lg p-2.5 text-xs font-mono text-iron-500 grid grid-cols-2 gap-x-4 gap-y-0.5">
                      <div><span className="text-[#00aaff] font-semibold">WR</span> = {tMath("glossary.wr_label")}</div>
                      <div><span className="text-risk-green font-semibold">W</span> = {tMath("glossary.w_label")}</div>
                      <div><span className="text-risk-red font-semibold">L</span> = {tMath("glossary.l_label")}</div>
                      <div><span className="text-[#00ffaa] font-semibold">E(X)</span> = {tMath("glossary.ev_label")} = WR × W − (1−WR) × L</div>
                    </div>

                    {/* STEP 1: Win Rate */}
                    <div className="space-y-1">
                      <div className="text-sm font-semibold text-iron-200">
                        {tMath("step1.title")}
                      </div>
                      <div className="text-xs text-iron-500">
                        {tMath("step1.model")} <span className="text-iron-300 font-mono">Beta-Bernoulli</span>.
                        {tMath("step1.modelDesc")}
                      </div>
                      <div className="bg-surface-tertiary rounded-lg p-3 text-xs font-mono space-y-1">
                        <div className="text-iron-600 text-xs font-sans font-semibold mb-1">{tMath("step1.inputs")}</div>
                        <div className="text-iron-500">Backtest: <span className="text-iron-300">{d.n_bt_wins}</span> wins + <span className="text-iron-300">{d.n_bt_losses}</span> losses = {d.n_bt_wins + d.n_bt_losses} trades</div>
                        <div className="text-iron-500">Live: <span className="text-iron-300">{d.n_live_wins}</span> wins + <span className="text-iron-300">{d.n_live_losses}</span> losses = {d.n_live_wins + d.n_live_losses} trades</div>
                        <div className="text-iron-500">
                          {tMath("step1.confBt", { conf: Math.round(100/d.bt_discount), eff: (1/d.bt_discount).toFixed(2) })}
                        </div>

                        <div className="text-iron-600 text-xs font-sans font-semibold mt-2 mb-1">{tMath("step1.prior")}</div>
                        <div className="text-iron-500">α₀ = {d.n_bt_wins} / {d.bt_discount} = <span className="text-iron-300">{d.eff_bt_wins}</span></div>
                        <div className="text-iron-500">β₀ = {d.n_bt_losses} / {d.bt_discount} = <span className="text-iron-300">{d.eff_bt_losses}</span></div>
                        <div className="text-iron-400">
                          Prior: Beta({d.eff_bt_wins}, {d.eff_bt_losses}) → Win Rate_prior = <span className="text-amber-400 font-semibold">{pct(d.eff_bt_wins / (d.eff_bt_wins + d.eff_bt_losses))}</span>
                        </div>

                        <div className="text-iron-600 text-xs font-sans font-semibold mt-2 mb-1">{tMath("step1.posterior")}</div>
                        <div className="text-iron-500">α = α₀ + {tMath("step4.liveWins")} = {d.eff_bt_wins} + {d.n_live_wins} = <span className="text-iron-300">{d.theta_alpha.toFixed(0)}</span></div>
                        <div className="text-iron-500">β = β₀ + {tMath("step4.liveLosses")} = {d.eff_bt_losses} + {d.n_live_losses} = <span className="text-iron-300">{d.theta_beta.toFixed(0)}</span></div>
                        <div className="text-iron-300 border-t border-iron-700 pt-1 mt-1">
                          Posterior: Beta({d.theta_alpha.toFixed(0)}, {d.theta_beta.toFixed(0)}) → <span className="text-[#00aaff] font-semibold">WR = {pct(d.theta_mean)}</span>
                        </div>
                        <div className="text-iron-500 text-xs">
                          IC {(d.confidence*100).toFixed(0)}%: [{pct(d.theta_lower)}, {pct(d.theta_upper)}]
                        </div>
                        <div className="text-iron-600 text-xs font-sans font-semibold mt-2 mb-1">{tMath("step1.variance")}</div>
                        <div className="text-iron-500 text-xs">
                          Var[WR] = α·β / ((α+β)²·(α+β+1))
                        </div>
                        <div className="text-iron-400 text-xs">
                          = {d.theta_alpha.toFixed(0)}·{d.theta_beta.toFixed(0)} / (({d.theta_alpha.toFixed(0)}+{d.theta_beta.toFixed(0)})²·({(d.theta_alpha + d.theta_beta).toFixed(0)}+1))
                        </div>
                        <div className="text-[#00aaff] text-xs font-semibold">
                          Var[WR] = {d.theta_var.toFixed(6)}
                        </div>

                      </div>
                      <BetaDistChart
                        priorA={d.eff_bt_wins} priorB={d.eff_bt_losses}
                        postA={d.theta_alpha} postB={d.theta_beta}
                        icLower={d.theta_lower} icUpper={d.theta_upper}
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="text-sm font-semibold text-iron-200">
                        {tMath("step2.title")}
                      </div>
                      <div className="text-xs text-iron-500">
                        {tMath("step2.model")} <span className="text-iron-300 font-mono">Normal-Inverse-Gamma</span>.
                        {tMath("step2.modelDesc")}
                      </div>
                      <div className="bg-surface-tertiary rounded-lg p-3 text-xs font-mono space-y-1">
                        <div className="text-iron-600 text-xs font-sans font-semibold mb-1">{tMath("step1.inputs")}</div>
                        <div className="text-iron-500">Backtest: <span className="text-iron-300">{d.n_bt_wins}</span> wins → media = <span className="text-iron-300">{usd(d.avg_win_bt)}</span></div>
                        <div className="text-iron-500">Live: <span className="text-iron-300">{d.avg_win_n > 0 ? `${d.avg_win_n} wins → media = ${usd(d.avg_win_live!)}` : "sin datos live todavía"}</span></div>
                        <div className="text-iron-500">
                          {tMath("step1.confBt", { conf: Math.round(100/d.bt_discount), eff: Math.round(d.n_bt_wins / d.bt_discount) })}
                        </div>

                        <div className="text-iron-600 text-xs font-sans font-semibold mt-2 mb-1">{tMath("step2.calcMean")}</div>
                        <div className="text-iron-500 text-xs font-sans">
                          {tMath("step2.calcMeanDesc")}
                        </div>
                        {(() => {
                          const nEff = Math.round(d.n_bt_wins / d.bt_discount);
                          const nLive = d.avg_win_n;
                          const total = nEff + nLive;
                          return (
                            <div className="text-iron-400 mt-1 space-y-0.5">
                              <div>W = ({nEff} × {usd(d.avg_win_bt)} + {nLive} × {usd(d.avg_win_live ?? d.avg_win_bt)}) / ({nEff} + {nLive})</div>
                              <div className="text-iron-300 font-semibold">W = <span className="text-risk-green">{usd(d.avg_win_mean)}</span></div>
                            </div>
                          );
                        })()}
                        <div className="text-iron-500 text-xs border-t border-iron-700 pt-1 mt-1">
                          IC {(d.confidence*100).toFixed(0)}%: [<span className="text-iron-300">{usd(d.avg_win_lower)}</span>, <span className="text-iron-300">{usd(d.avg_win_upper)}</span>]
                        </div>
                        {d.avg_win_live !== null && (
                          <div className="text-iron-600 text-xs font-sans">
                            Δ vs Backtest: {usd(d.avg_win_mean - d.avg_win_bt)} ({d.avg_win_mean > d.avg_win_bt ? tMath("step2.deltaBtUp") : tMath("step2.deltaBtDown")})
                          </div>
                        )}
                        <div className="text-iron-600 text-xs font-sans font-semibold mt-2 mb-1">{tMath("step2.varianceTitle")}</div>
                        {(() => {
                          const nEff = Math.round(d.n_bt_wins / d.bt_discount) + d.avg_win_n;
                          const s2 = d.avg_win_var * nEff; // reverse: s² = Var[media] × n
                          return (
                            <div className="text-xs space-y-0.5">
                              <div className="text-iron-500 font-sans">
                                {tMath("step2.varianceDesc1")}
                              </div>
                              <div className="text-iron-400 font-mono bg-iron-800/40 rounded px-2 py-1">
                                Var[W] = s²<sub>wins</sub> / n<sub>eff</sub>
                              </div>
                              <div className="text-iron-500 font-sans">{tMath("step2.varianceWhere")}</div>
                              <div className="text-iron-400 pl-2 space-y-0.5">
                                <div>
                                  s²<sub>wins</sub> = <span className="text-iron-300 font-semibold">{s2.toFixed(2)}</span>
                                  <span className="text-iron-600"> {tMath("step2.varianceDisp", { count: d.n_bt_wins })}</span>
                                </div>
                                <div>
                                  n<sub>eff</sub> = <span className="text-iron-300 font-semibold">{nEff}</span>
                                  <span className="text-iron-600">{tMath("step2.varianceEff")} {d.n_bt_wins} Backtest / {d.bt_discount} = {Math.round(d.n_bt_wins / d.bt_discount)}{d.avg_win_n > 0 ? tMath("step2.varianceEffLive", { n: d.avg_win_n }) : ''}</span>
                                </div>
                              </div>
                              <div className="text-iron-600 font-sans bg-iron-800/30 rounded p-1.5 mt-1">
                                {tMath("step2.varianceNote", { n_eff: nEff, n_bt: d.n_bt_wins })}
                              </div>
                              <div className="text-iron-400 font-mono mt-1">
                                Var[W] = {s2.toFixed(2)} / {nEff} = <span className="text-risk-green font-semibold">{d.avg_win_var.toFixed(4)}</span>
                              </div>
                              <div className="text-iron-500">
                                σ<sub>W</sub> = √Var = <span className="text-risk-green font-semibold">{usd(Math.sqrt(d.avg_win_var))}</span>
                              </div>
                              <div className="text-iron-600 font-sans mt-1">
                                {tMath("step2.verify")} IC = W ± t × σ ≈ {usd(d.avg_win_mean)} ± {usd(d.avg_win_mean - d.avg_win_lower)} = [{usd(d.avg_win_lower)}, {usd(d.avg_win_upper)}] ✅
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                      <GaussianChart
                        mean={d.avg_win_mean}
                        std={(d.avg_win_upper - d.avg_win_lower) / (2 * 1.96)}
                        lower={d.avg_win_lower}
                        upper={d.avg_win_upper}
                        label="W"
                        color="#10b981"
                        zeroLine={false}
                        height={100}
                        refLines={[{ x: d.avg_win_bt, color: "#f59e0b", label: `Backtest (${usd(d.avg_win_bt)})`, dashed: true }]}
                      />
                    </div>

                    {/* STEP 3: AvgLoss */}
                    <div className="space-y-1">
                      <div className="text-sm font-semibold text-iron-200">
                        {tMath("step3.title")}
                      </div>
                      <div className="text-xs text-iron-500">
                        {tMath("step3.modelDesc")}
                      </div>
                      <div className="bg-surface-tertiary rounded-lg p-3 text-xs font-mono space-y-1">
                        <div className="text-iron-600 text-xs font-sans font-semibold mb-1">{tMath("step1.inputs")}</div>
                        <div className="text-iron-500">Backtest: <span className="text-iron-300">{d.n_bt_losses}</span> losses → media = <span className="text-iron-300">{usd(d.avg_loss_bt)}</span></div>
                        <div className="text-iron-500">Live: <span className="text-iron-300">{d.avg_loss_n > 0 ? `${d.avg_loss_n} losses → media = ${usd(d.avg_loss_live!)}` : "sin datos live todavía"}</span></div>
                        <div className="text-iron-500">
                          {tMath("step1.confBt", { conf: Math.round(100/d.bt_discount), eff: Math.round(d.n_bt_losses / d.bt_discount) })}
                        </div>

                        <div className="text-iron-600 text-xs font-sans font-semibold mt-2 mb-1">{tMath("step2.calcMean")}</div>
                        <div className="text-iron-500 text-xs font-sans">
                          {tMath("step2.calcMeanDesc")}
                        </div>
                        {(() => {
                          const nEff = Math.round(d.n_bt_losses / d.bt_discount);
                          const nLive = d.avg_loss_n;
                          const total = nEff + nLive;
                          return (
                            <div className="text-iron-400 mt-1 space-y-0.5">
                              <div>L = ({nEff} × {usd(d.avg_loss_bt)} + {nLive} × {usd(d.avg_loss_live ?? d.avg_loss_bt)}) / ({nEff} + {nLive})</div>
                              <div className="text-iron-300 font-semibold">L = <span className="text-risk-red">{usd(d.avg_loss_mean)}</span></div>
                            </div>
                          );
                        })()}
                        <div className="text-iron-500 text-xs border-t border-iron-700 pt-1 mt-1">
                          IC {(d.confidence*100).toFixed(0)}%: [<span className="text-iron-300">{usd(d.avg_loss_lower)}</span>, <span className="text-iron-300">{usd(d.avg_loss_upper)}</span>]
                        </div>
                        {d.avg_loss_live !== null && (
                          <div className="text-iron-600 text-xs font-sans">
                            Δ vs Backtest: {usd(d.avg_loss_mean - d.avg_loss_bt)} ({d.avg_loss_mean > d.avg_loss_bt ? tMath("step3.deltaBtUp") : tMath("step3.deltaBtDown")})
                          </div>
                        )}
                        <div className="text-iron-600 text-xs font-sans font-semibold mt-2 mb-1">{tMath("step2.varianceTitle")}</div>
                        {(() => {
                          const nEff = Math.round(d.n_bt_losses / d.bt_discount) + d.avg_loss_n;
                          const s2 = d.avg_loss_var * nEff;
                          return (
                            <div className="text-xs space-y-0.5">
                              <div className="text-iron-500 font-sans">
                                {tMath("step2.varianceDesc1")}
                              </div>
                              <div className="text-iron-400 font-mono bg-iron-800/40 rounded px-2 py-1">
                                Var[L] = s²<sub>losses</sub> / n<sub>eff</sub>
                              </div>
                              <div className="text-iron-500 font-sans">{tMath("step2.varianceWhere")}</div>
                              <div className="text-iron-400 pl-2 space-y-0.5">
                                <div>
                                  s²<sub>losses</sub> = <span className="text-iron-300 font-semibold">{s2.toFixed(2)}</span>
                                  <span className="text-iron-600"> {tMath("step3.varianceDisp", { count: d.n_bt_losses })}</span>
                                </div>
                                <div>
                                  n<sub>eff</sub> = <span className="text-iron-300 font-semibold">{nEff}</span>
                                  <span className="text-iron-600">{tMath("step3.varianceEff")} {d.n_bt_losses} Backtest / {d.bt_discount} = {Math.round(d.n_bt_losses / d.bt_discount)}{d.avg_loss_n > 0 ? tMath("step2.varianceEffLive", { n: d.avg_loss_n }) : ''}</span>
                                </div>
                              </div>
                              <div className="text-iron-600 font-sans bg-iron-800/30 rounded p-1.5 mt-1">
                                {tMath("step2.varianceNote", { n_eff: nEff, n_bt: d.n_bt_losses })}
                              </div>
                              <div className="text-iron-400 font-mono mt-1">
                                Var[L] = {s2.toFixed(2)} / {nEff} = <span className="text-risk-red font-semibold">{d.avg_loss_var.toFixed(4)}</span>
                              </div>
                              <div className="text-iron-500">
                                σ<sub>L</sub> = √Var = <span className="text-risk-red font-semibold">{usd(Math.sqrt(d.avg_loss_var))}</span>
                              </div>
                              <div className="text-iron-600 font-sans mt-1">
                                {tMath("step2.verify")} IC = L ± t × σ ≈ {usd(d.avg_loss_mean)} ± {usd(d.avg_loss_mean - d.avg_loss_lower)} = [{usd(d.avg_loss_lower)}, {usd(d.avg_loss_upper)}] ✅
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                      <GaussianChart
                        mean={d.avg_loss_mean}
                        std={(d.avg_loss_upper - d.avg_loss_lower) / (2 * 1.96)}
                        lower={d.avg_loss_lower}
                        upper={d.avg_loss_upper}
                        label="L"
                        color="#ef4444"
                        zeroLine={false}
                        height={100}
                        refLines={[{ x: d.avg_loss_bt, color: "#f59e0b", label: `Backtest (${usd(d.avg_loss_bt)})`, dashed: true }]}
                      />
                    </div>

                    {/* STEP 4: Combine */}
                    <div className="space-y-1">
                      <div className="text-sm font-semibold text-iron-200">
                        {tMath("step4.title")}
                      </div>
                      <div className="text-xs text-iron-500">
                        {tMath("step4.modelDesc")}
                      </div>
                      <div className="bg-surface-tertiary rounded-lg p-3 text-xs font-mono space-y-1">
                        <div className="text-iron-600 text-xs font-sans font-semibold mb-1">{tMath("step4.formula")}</div>
                        <div className="text-iron-400">E(X) = WR × W − (1 − WR) × L</div>
                        <div className="text-iron-400">E(X) = {pct(d.theta_mean)} × {usd(d.avg_win_mean)} − {pct(1-d.theta_mean)} × {usd(d.avg_loss_mean)}</div>
                        <div className="text-[#00ffaa] font-semibold text-sm border-t border-iron-700 pt-1 mt-1">
                          E(X) = {usd(d.ev_mean)} {tMath("step4.perTrade")}
                        </div>

                        <div className="text-iron-600 text-xs font-sans font-semibold mt-3 mb-1">{tMath("step4.uncertaintyTitle")}</div>
                        <div className="text-iron-500 text-xs font-sans mb-1">
                          {tMath("step4.uncertaintyDesc")}
                        </div>
                        <div className="text-iron-400 text-xs">Var[E(X)] = W² × Var[WR] + WR² × Var[W] + L² × Var[WR] + (1−WR)² × Var[L]</div>
                        <div className="bg-iron-800/60 rounded p-2 mt-1 space-y-1.5 text-xs">
                          <div>
                            <div className="text-iron-500">
                              Var[WR] = <span className="text-iron-300 font-semibold">{d.theta_var.toFixed(6)}</span>
                              <span className="text-iron-600 ml-2">{tMath("step4.fromStep1")}</span>
                            </div>
                            <div className="text-iron-600 pl-2">
                              = α·β / ((α+β)²·(α+β+1)) = {d.theta_alpha.toFixed(0)}·{d.theta_beta.toFixed(0)} / (({d.theta_alpha.toFixed(0)}+{d.theta_beta.toFixed(0)})²·({(d.theta_alpha + d.theta_beta).toFixed(0)}+1))
                            </div>
                          </div>
                          <div>
                            <div className="text-iron-500">
                              Var[W] = <span className="text-iron-300 font-semibold">{d.avg_win_var.toFixed(4)}</span>
                              <span className="text-iron-600 ml-2">{tMath("step4.fromStep2")}</span>
                            </div>
                            <div className="text-iron-600 pl-2">
                              = {tMath("step4.fromStep2Desc")} ({d.avg_win_n} {tMath("step4.liveWins")})
                            </div>
                          </div>
                          <div>
                            <div className="text-iron-500">
                              Var[L] = <span className="text-iron-300 font-semibold">{d.avg_loss_var.toFixed(4)}</span>
                              <span className="text-iron-600 ml-2">{tMath("step4.fromStep3")}</span>
                            </div>
                            <div className="text-iron-600 pl-2">
                              = {tMath("step4.fromStep3Desc")} ({d.avg_loss_n} {tMath("step4.liveLosses")})
                            </div>
                          </div>
                          {(() => {
                            const W = d.avg_win_mean;
                            const L = d.avg_loss_mean;
                            const Vt = d.theta_var;
                            const Vw = d.avg_win_var;
                            const Vl = d.avg_loss_var;
                            const t1 = W * W * Vt;
                            const t2 = d.theta_mean * d.theta_mean * Vw;
                            const t3 = L * L * Vt;
                            const t4 = (1 - d.theta_mean) ** 2 * Vl;
                            const evVar = t1 + t2 + t3 + t4;
                            return (
                              <>
                                <div className="text-iron-400 mt-1 border-t border-iron-700 pt-1">
                                  = {usd(W)}² × {Vt.toFixed(6)} + {pct(d.theta_mean)}² × {Vw.toFixed(4)} + {usd(L)}² × {Vt.toFixed(6)} + {pct(1 - d.theta_mean)}² × {Vl.toFixed(4)}
                                </div>
                                <div className="text-iron-300">Var[E(X)] = {evVar.toFixed(4)}</div>
                                <div className="text-[#00ffaa] font-semibold">σ = √Var = {usd(Math.sqrt(evVar))}</div>
                              </>
                            );
                          })()}
                        </div>
                        <div className="text-iron-500 text-xs mt-1">
                          IC = E(X) ± z × σ = {usd(d.ev_mean)} ± {(1.96).toFixed(2)} × {usd(d.ev_std)} = [{usd(d.ev_lower)}, {usd(d.ev_upper)}]
                        </div>
                      </div>
                      <GaussianChart
                        mean={d.ev_mean} std={d.ev_std}
                        lower={d.ev_lower} upper={d.ev_upper}
                        label="Expectancy"
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="text-sm font-semibold text-iron-200">
                        {tMath("step5.title")}
                      </div>
                      <div className="text-xs text-iron-500">
                        {tMath("step5.modelDesc")}
                      </div>
                      <div className="bg-surface-tertiary rounded-lg p-3 text-xs font-mono space-y-1">
                        <div className="text-iron-600 text-xs font-sans font-semibold mb-1">{tMath("step5.whatIsPhi")}</div>
                        <div className="text-iron-500 text-xs font-sans">
                          {tMath("step5.phiDesc1")}
                          <br/>{tMath("step5.phiDesc2")}
                        </div>

                        <div className="text-iron-600 text-xs font-sans font-semibold mt-2 mb-1">{tMath("step5.stepByStep")}</div>
                        <div className="text-iron-500 text-xs font-sans">
                          {tMath("step5.sbsDesc")}
                        </div>
                        <div className="text-iron-400 pl-2">
                          <div>μ = <span className="text-iron-300">{usd(d.ev_mean)}</span> <span className="text-iron-600">{tMath("step5.meanText")}</span></div>
                          <div>σ = <span className="text-iron-300">{usd(d.ev_std)}</span> <span className="text-iron-600">{tMath("step5.uncertText")}</span></div>
                        </div>

                        <div className="text-iron-500 text-xs font-sans mt-1">
                          {tMath("step5.question")} <em className="text-iron-300">{tMath("step5.questionText")}</em>
                        </div>

                        {(() => {
                          const z = (0 - d.ev_mean) / d.ev_std;
                          return (
                            <div className="bg-iron-800/40 rounded p-2 mt-1 space-y-0.5">
                              <div className="text-iron-600 text-xs font-sans font-semibold">{tMath("step5.calc1")}</div>
                              <div className="text-iron-400">
                                z = (0 − μ) / σ = (0 − {d.ev_mean.toFixed(2)}) / {d.ev_std.toFixed(2)} = <span className="text-iron-300 font-semibold">{z.toFixed(2)}</span>
                              </div>
                              <div className="text-iron-600 text-xs font-sans mt-1">
                                {tMath("step5.calc1Result", { val: Math.abs(z).toFixed(2), dir: z < 0 ? tMath("step5.left") : tMath("step5.right") })}
                              </div>

                              <div className="text-iron-600 text-xs font-sans font-semibold mt-2">{tMath("step5.calc2")}</div>
                              <div className="text-iron-400">
                                Φ({z.toFixed(2)}) = <span className="text-iron-300">{(1 - d.p_positive).toFixed(4)}</span>
                                <span className="text-iron-600"> {tMath("step5.calc2Result", { pct: ((1 - d.p_positive) * 100).toFixed(1) })}</span>
                              </div>

                              <div className="text-iron-600 text-xs font-sans font-semibold mt-2">{tMath("step5.calc3")}</div>
                              <div className="text-iron-400">
                                P(Expectancy &gt; 0) = 1 − Φ({z.toFixed(2)}) = 1 − {(1 - d.p_positive).toFixed(4)}
                              </div>
                            </div>
                          );
                        })()}

                        <div className={`font-semibold text-sm border-t border-iron-700 pt-1 mt-1 ${d.p_positive > 0.8 ? "text-risk-green" : d.p_positive > 0.5 ? "text-amber-400" : "text-risk-red"}`}>
                          P(Expectancy &gt; 0) = {(d.p_positive * 100).toFixed(1)}%
                        </div>
                        <div className="text-iron-600 text-xs font-sans">
                          → {tMath("step5.finalResult", { pct: (d.p_positive * 100).toFixed(1) })}
                        </div>
                        
                        <details className="mt-4 border border-iron-800 rounded-lg bg-surface-tertiary">
                          <summary className="cursor-pointer text-xs text-iron-400 font-semibold p-2.5 hover:text-iron-200 select-none flex items-center gap-2">
                            <span>💡</span> {tMath("step5.cltTitle")}
                          </summary>
                          <div className="px-3 pb-3 pt-1 space-y-2 text-xs text-iron-500 font-sans border-t border-iron-800">
                            <p>{tMath("step5.cltDesc1")}</p>
                            <p>{tMath("step5.cltDesc2")}</p>
                          </div>
                        </details>
                      </div>
                      <GaussianChart
                        mean={d.ev_mean} std={d.ev_std}
                        lower={d.ev_lower} upper={d.ev_upper}
                        label="Expectancy"
                        hideIcFill
                        shadeAbove={0}
                        shadeAboveColor="#10b981"
                        shadeAboveLabel={`P(Expectancy > 0) = ${(d.p_positive * 100).toFixed(1)}%`}
                        shadeBelow={0}
                        shadeBelowColor="#ef4444"
                        shadeBelowLabel={`P(Expectancy < 0) = ${((1 - d.p_positive) * 100).toFixed(1)}%`}
                        refLines={[
                          { x: d.ev_lower, color: "#f59e0b", dashed: true, hideLegend: true },
                          { x: d.ev_upper, color: "#f59e0b", dashed: true, hideLegend: true },
                        ]}
                      />
                    </div>

                  </div>
                </details>
              </div>

              {/* Risk Gauges */}
              <div className="bg-surface-secondary border border-iron-700 rounded-xl p-4">
                <h3 className="text-xs font-semibold text-iron-300 mb-3">📉 Gauges de Riesgo (info visual)</h3>
                {data?.risk_gauges && Object.keys(data.risk_gauges).length > 0 ? (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                      {Object.entries(data.risk_gauges).map(([key, gauge]) => {
                        const label = METRICS.find(m => m.key === key)?.label || key;
                        const statusColor = gauge.status === "green" ? "text-risk-green" : gauge.status === "amber" ? "text-amber-400" : "text-risk-red";
                        const statusIcon = gauge.status === "green" ? "✅" : gauge.status === "amber" ? "⚠️" : "🔴";
                        return (
                          <div key={key} className={`bg-surface-tertiary rounded-lg p-3 ${gauge.simulated ? 'border border-amber-500/30' : ''}`}>
                            <div className="text-xs text-iron-400 font-semibold flex items-center gap-1">
                              {label}
                              {gauge.simulated && <span className="text-amber-400 text-[10px]" title={tMath("ui.gaugeTooltipSim")}>🧪 sim</span>}
                            </div>
                            <div className="flex items-baseline gap-2">
                              <span className="text-sm font-bold text-iron-200">
                                {metricFormatter.format(key, gauge.current)}
                              </span>
                              <span className={`text-xs font-mono font-bold ${statusColor}`}>
                                {statusIcon} P{gauge.percentile.toFixed(0)}
                              </span>
                            </div>
                            <div className="w-full bg-iron-800 rounded-full h-1.5 mt-1">
                              <div
                                className={`h-full rounded-full ${
                                  gauge.status === "green" ? "bg-emerald-500" : gauge.status === "amber" ? "bg-amber-500" : "bg-red-500"
                                }`}
                                style={{ width: `${Math.min(gauge.percentile, 100)}%` }}
                              />
                            </div>
                            {gauge.limit && gauge.limit > 0 && (
                              <div className="text-[11px] text-iron-500 mt-1 opacity-90 font-mono tracking-tight" title={tMath("ui.gaugeTooltipLim")}>
                                {tMath("ui.gaugePctLim", { 
                                  pct: ((gauge.current / gauge.limit) * 100).toFixed(1),
                                  limit: metricFormatter.format(key, gauge.limit)
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-xs text-iron-500 mt-3 pl-1">
                      Percentiles respecto al backtest. No alimentan P(EV&gt;0).
                    </p>
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
              <span className="text-3xl">🤖</span>
              <p className="text-iron-400 mt-2">Selecciona un elemento en la tabla inferior para analizar</p>
            </div>
          )}
        </div>
      </div>
  );
};
