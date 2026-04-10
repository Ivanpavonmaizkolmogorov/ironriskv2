"use client";

import React, { useState, useEffect, useMemo } from "react";
import { strategyAPI, portfolioAPI } from "@/services/api";
import { useStrategyStore } from "@/store/useStrategyStore";
import { usePortfolioStore } from "@/store/usePortfolioStore";
import InteractiveDistribution from "@/components/features/charts/InteractiveDistribution";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid
} from "recharts";
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
    const pts: { x: number; density: number; ic: number | null; positive: number | null; negative: number | null }[] = [];
    const n = 200;
    for (let i = 0; i <= n; i++) {
      const x = lo + (hi - lo) * (i / n);
      const y = normalPdf(x, mean, std);
      pts.push({
        x: Math.round(x * 100) / 100,
        density: y,
        ic: (x >= lower && x <= upper) ? y : null,
        positive: (shadeAbove !== undefined && x >= shadeAbove) ? y : null,
        negative: (shadeBelow !== undefined && x < shadeBelow) ? y : null,
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
                const x = payload[0]?.payload?.x;
                return (
                  <div className="bg-[#1e2228] border border-[#3e444f] rounded-lg px-3 py-2 text-[11px]">
                    <div className="text-iron-400">{label}: <span className="text-white font-mono">{fmt(x)}</span></div>
                    <div className="text-iron-400">Densidad: <span className="font-mono">{payload[0]?.payload?.density?.toFixed(4)}</span></div>
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
      <div className="flex items-center justify-between mt-1 text-[9px]">
        <div className="flex gap-3">
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
  live_equity_curve?: number[];
  p_positive_curve?: number[];
  historical_risk?: HistoricalRiskStep[];
}

export interface HistoricalRiskStep {
  index: number;
  status: 'green' | 'amber' | 'red';
  reasons: string[];
  bayes: number | null;
  consistency: {
    win_rate_p: number;
    streak_p: number;
    pnl_p: number;
  };
  empirical: {
    dd: number;
    dd_p: number;
    stag_days: number;
    stag_days_p: number;
    stag_trades: number;
    stag_trades_p: number;
  };
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

function LiveEquityArea({ data, pPositiveCurve, historicalRisk }: { data: number[], pPositiveCurve?: number[], historicalRisk?: HistoricalRiskStep[] }) {
  const [activePoint, setActivePoint] = useState<any>(null);

  const chartData = useMemo(() => {
    return data.map((v, i) => ({ 
      index: i, 
      value: v,
      prob: pPositiveCurve ? pPositiveCurve[i] : null,
      risk: historicalRisk ? historicalRisk[i] : null
    }));
  }, [data, pPositiveCurve, historicalRisk]);
  
  if (!data || data.length === 0) return null;

  const minVal = Math.min(...data);
  const maxVal = Math.max(...data);

  const renderSidePanel = () => {
    // Si no hay hover, mostrar el último punto por defecto
    const dataPoint = activePoint || chartData[chartData.length - 1];
    if (!dataPoint) return null;

    const risk: HistoricalRiskStep | null = dataPoint.risk;
    const eq = dataPoint.value;
    const prob = dataPoint.prob;
    const label = dataPoint.index;

    return (
      <div className="bg-iron-900 border border-iron-700 p-3 rounded-lg shadow-xl text-[10px] w-64 h-full flex flex-col space-y-2 shrink-0">
        <div className="flex justify-between items-center mb-1">
          <span className="font-bold text-iron-200">Trade #{label}</span>
          <span className="font-mono font-bold text-iron-300">Eq: ${eq?.toFixed(2)}</span>
        </div>

        {risk ? (
          <>
            <div className={`p-1.5 rounded flex items-center gap-2 ${
              risk.status === 'red' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
              risk.status === 'amber' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' :
              'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
            }`}>
              <div className={`w-2 h-2 rounded-full ${
                risk.status === 'red' ? 'bg-red-500' :
                risk.status === 'amber' ? 'bg-amber-500' :
                'bg-emerald-500'
              }`} />
              <span className="font-bold">
                {risk.status === 'red' ? 'PAUSAR' : risk.status === 'amber' ? 'DESVIACIÓN' : 'CONSISTENTE'}
              </span>
            </div>

            {risk.status !== 'green' && (
              <div className="text-iron-400 space-y-0.5 ml-4 list-disc text-[9px] flex-1">
                {risk.reasons.map((r, idx) => (
                  <div key={idx}>• {r}</div>
                ))}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2 mt-auto pt-2 border-t border-iron-800">
              <div>
                <div className="text-iron-500 font-semibold mb-1">Bayes</div>
                <div className="text-amber-500">P(EV&gt;0): {prob}%</div>
              </div>
              <div>
                <div className="text-iron-500 font-semibold mb-1">Consistencia</div>
                <div className={`${risk.consistency.win_rate_p < 2 ? 'text-red-400' : risk.consistency.win_rate_p < 10 ? 'text-amber-400' : 'text-emerald-400'}`}>WR p={risk.consistency.win_rate_p}%</div>
                <div className={`${risk.consistency.streak_p < 2 ? 'text-red-400' : risk.consistency.streak_p < 10 ? 'text-amber-400' : 'text-emerald-400'}`}>Racha p={risk.consistency.streak_p}%</div>
                <div className={`${risk.consistency.pnl_p < 2 ? 'text-red-400' : risk.consistency.pnl_p < 10 ? 'text-amber-400' : 'text-emerald-400'}`}>PnL p={risk.consistency.pnl_p}%</div>
              </div>
            </div>
            
            <div className="mt-2 pt-2 border-t border-iron-800">
              <div className="text-iron-500 font-semibold mb-1">Riesgo Empírico</div>
              <div className="grid grid-cols-2 gap-1 text-[9px]">
                <div className={`${risk.empirical.dd_p >= 95 ? 'text-red-400' : risk.empirical.dd_p >= 85 ? 'text-amber-400' : 'text-emerald-400'}`}>DD: P{risk.empirical.dd_p} (${risk.empirical.dd.toFixed(1)})</div>
                <div className={`${risk.empirical.stag_days_p >= 95 ? 'text-red-400' : risk.empirical.stag_days_p >= 85 ? 'text-amber-400' : 'text-emerald-400'}`}>Stag Día: P{risk.empirical.stag_days_p}</div>
                <div className={`${risk.empirical.stag_trades_p >= 95 ? 'text-red-400' : risk.empirical.stag_trades_p >= 85 ? 'text-amber-400' : 'text-emerald-400'}`}>Stag T: P{risk.empirical.stag_trades_p}</div>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="text-iron-400">P(EV&gt;0): <span className="text-amber-400">{prob}%</span></div>
          </>
        )}
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full h-auto min-h-[220px]">
      <div className="md:col-span-2 h-[200px] md:h-[220px] relative min-w-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}
            onMouseMove={(e) => {
              if (e && e.activePayload) {
                setActivePoint(e.activePayload[0].payload);
              }
            }}
            onMouseLeave={() => setActivePoint(null)}
          >
            <defs>
              <linearGradient id="colorEq" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#00aaff" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="#00aaff" stopOpacity={0}/>
              </linearGradient>
              <linearGradient id="colorEqNeg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0}/>
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0.8}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
            <XAxis dataKey="index" hide />
            <YAxis yAxisId="left" domain={['auto', 'auto']} hide />
            {pPositiveCurve && (
              <YAxis yAxisId="right" orientation="right" domain={[0, 100]} hide />
            )}
            <Tooltip
              cursor={{ stroke: '#94a3b8', strokeWidth: 1, strokeDasharray: '3 3' }}
              content={() => null} // Disable default tooltip content
            />
            <ReferenceLine y={0} yAxisId="left" stroke="#475569" strokeDasharray="3 3" />
            {/* We plot positive and negative areas */}
            {minVal < 0 && (
              <Area yAxisId="left" type="step" dataKey="value" stroke="#ef4444" strokeWidth={2} fillOpacity={1} fill="url(#colorEqNeg)" />
            )}
            {maxVal >= 0 && (
              <Area yAxisId="left" type="step" dataKey="value" stroke="#00aaff" strokeWidth={2} fillOpacity={1} fill="url(#colorEq)" />
            )}
            
            {pPositiveCurve && (
              <Area yAxisId="right" type="monotone" dataKey="prob" stroke="#f59e0b" fill="none" strokeWidth={2} strokeOpacity={0.8} />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="md:col-span-1 h-full w-full">
        {renderSidePanel()}
      </div>
    </div>
  );
}

export default function BayesSandbox() {
  const { strategies } = useStrategyStore();
  const { portfolios } = usePortfolioStore();
  const [selectedId, setSelectedId] = useState<string>("");
  const [data, setData] = useState<BayesData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Controls
  const [minTradesCi, setMinTradesCi] = useState<number>(30);
  const [ciConfidence, setCiConfidence] = useState<number>(0.95);
  const [maxBtTrades, setMaxBtTrades] = useState<number>(30);
  const [simPnl, setSimPnl] = useState<string>("");

  // Thresholds state
  const [threshRedDD, setThreshRedDD] = useState<number>(95);
  const [threshAmberDD, setThreshAmberDD] = useState<number>(85);
  const [threshRedStagD, setThreshRedStagD] = useState<number>(95);
  const [threshAmberStagD, setThreshAmberStagD] = useState<number>(85);
  const [threshRedStagT, setThreshRedStagT] = useState<number>(95);
  const [threshAmberStagT, setThreshAmberStagT] = useState<number>(85);
  
  const [threshRedBayes, setThreshRedBayes] = useState<number>(50);
  const [threshAmberBayes, setThreshAmberBayes] = useState<number>(80);
  const [threshRedConsist, setThreshRedConsist] = useState<number>(0.02);
  const [threshAmberConsist, setThreshAmberConsist] = useState<number>(0.10);
  const [threshRedLosses, setThreshRedLosses] = useState<number>(95);
  const [threshAmberLosses, setThreshAmberLosses] = useState<number>(85);
  const [useRedLosses, setUseRedLosses] = useState<boolean>(true);
  const [useAmberLosses, setUseAmberLosses] = useState<boolean>(true);

  // Toggles state
  const [useRedDD, setUseRedDD] = useState<boolean>(true);
  const [useAmberDD, setUseAmberDD] = useState<boolean>(true);
  const [useRedStagD, setUseRedStagD] = useState<boolean>(true);
  const [useAmberStagD, setUseAmberStagD] = useState<boolean>(true);
  const [useRedStagT, setUseRedStagT] = useState<boolean>(true);
  const [useAmberStagT, setUseAmberStagT] = useState<boolean>(true);

  const [useRedBayes, setUseRedBayes] = useState<boolean>(true);
  const [useAmberBayes, setUseAmberBayes] = useState<boolean>(true);
  const [useRedConsist, setUseRedConsist] = useState<boolean>(true);
  const [useAmberConsist, setUseAmberConsist] = useState<boolean>(true);

  // Chart state
  const [selectedMetric, setSelectedMetric] = useState<string>("max_drawdown");
  const [chartDataState, setChartDataState] = useState<any>(null);
  const [chartLoading, setChartLoading] = useState(false);

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
    try {
        const params: any = {
          min_trades_ci: overrideMinTrades ?? minTradesCi,
          ci_confidence: overrideCiConf ?? ciConfidence,
          max_bt_trades: maxBtTrades,
          sim_pnl: simPnl || undefined,
          thresh_red_dd: useRedDD ? threshRedDD : 101,
          thresh_amber_dd: useAmberDD ? threshAmberDD : 101,
          thresh_red_stag_d: useRedStagD ? threshRedStagD : 101,
          thresh_amber_stag_d: useAmberStagD ? threshAmberStagD : 101,
          thresh_red_stag_t: useRedStagT ? threshRedStagT : 101,
          thresh_amber_stag_t: useAmberStagT ? threshAmberStagT : 101,
          thresh_red_bayes: useRedBayes ? threshRedBayes : -1,
          thresh_amber_bayes: useAmberBayes ? threshAmberBayes : -1,
          thresh_red_consist: useRedConsist ? threshRedConsist : -1.0,
          thresh_amber_consist: useAmberConsist ? threshAmberConsist : -1.0,
          thresh_red_losses: useRedLosses ? threshRedLosses : 101,
          thresh_amber_losses: useAmberLosses ? threshAmberLosses : 101,
        };
      
      const isPortfolio = portfolios.some(p => p.id === selectedId);
      const apiCaller = isPortfolio ? portfolioAPI : strategyAPI;
      
      const res = await apiCaller.getBayes(selectedId, params);
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
      try {
        const params: any = {
          min_trades_ci: minTradesCi,
          ci_confidence: ciConfidence,
          max_bt_trades: maxBtTrades,
          sim_pnl: simPnl || undefined,
          thresh_red_dd: useRedDD ? threshRedDD : 101,
          thresh_amber_dd: useAmberDD ? threshAmberDD : 101,
          thresh_red_stag_d: useRedStagD ? threshRedStagD : 101,
          thresh_amber_stag_d: useAmberStagD ? threshAmberStagD : 101,
          thresh_red_stag_t: useRedStagT ? threshRedStagT : 101,
          thresh_amber_stag_t: useAmberStagT ? threshAmberStagT : 101,
          thresh_red_bayes: useRedBayes ? threshRedBayes : -1,
          thresh_amber_bayes: useAmberBayes ? threshAmberBayes : -1,
          thresh_red_consist: useRedConsist ? threshRedConsist : -1.0,
          thresh_amber_consist: useAmberConsist ? threshAmberConsist : -1.0,
          thresh_red_losses: useRedLosses ? threshRedLosses : 101,
          thresh_amber_losses: useAmberLosses ? threshAmberLosses : 101,
        };
        const isPortfolio = portfolios.some(p => p.id === selectedId);
        const apiCaller = isPortfolio ? portfolioAPI : strategyAPI;
        
        const res = await apiCaller.getBayes(selectedId, params);
        setData(res.data);
      } catch (err: any) {
        setError(err?.response?.data?.detail || "Request failed");
      }
      setLoading(false);
    }, simPnl ? 600 : 0);  // debounce only for sim typing
    return () => clearTimeout(timer);
  }, [selectedId, maxBtTrades, ciConfidence, minTradesCi, simPnl, useRedDD, useAmberDD, useRedStagD, useAmberStagD, useRedStagT, useAmberStagT, useRedBayes, useAmberBayes, useRedConsist, useAmberConsist]);

  const fetchChartData = async () => {
    if (!selectedId || !selectedMetric) return;
    setChartLoading(true);
    try {
      const isPortfolio = portfolios.some(p => p.id === selectedId);
      const apiCaller = isPortfolio ? portfolioAPI : strategyAPI;
      const res = await apiCaller.getChartData(selectedId, selectedMetric);
      setChartDataState(res.data);
    } catch {
      setChartDataState(null);
    }
    setChartLoading(false);
  };

  useEffect(() => {
    if (selectedId) fetchChartData();
  }, [selectedId, selectedMetric]);

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
          <h1 className="text-xl font-bold text-iron-100">Bayes Sandbox</h1>
          <p className="text-xs text-iron-500">Descomposición Bayesiana del Expected Value — Beta + NIG + Delta Method</p>
        </div>
      </div>

      {/* Strategy Selector + Controls */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1 space-y-4">
          {/* Selector */}
          <div className="bg-surface-secondary border border-iron-700 rounded-xl p-4">
            <label className="text-xs text-iron-400 block mb-2">Estrategia / Portfolio</label>
            <select
              value={selectedId}
              onChange={(e) => setSelectedId(e.target.value)}
              className="w-full bg-surface-tertiary border border-iron-700 rounded-lg px-3 py-2 text-sm text-iron-100"
            >
              <option value="">— Seleccionar —</option>
              {strategies.length > 0 && (
                <optgroup label="Estrategias Individuales">
                  {strategies.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </optgroup>
              )}
              {portfolios.length > 0 && (
                <optgroup label="Portfolios (Agregado Bayesiano)">
                  {portfolios.map((p) => (
                    <option key={p.id} value={p.id}>📦 {p.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          {/* Controls */}
          <div className="bg-surface-secondary border border-iron-700 rounded-xl p-4 space-y-4">
            <h3 className="text-sm font-semibold text-iron-200">⚙️ Parámetros</h3>

            

            

                          <div>
                <label className="text-xs text-iron-400 block mb-1">
                  Max BT Trades (Techo prior): <span className="text-iron-200 font-mono">{maxBtTrades === 0 ? "Sin Límite" : maxBtTrades}</span>
                </label>
                <input type="range" min={0} max={1000} step={10} value={maxBtTrades} onChange={(e) => setMaxBtTrades(parseInt(e.target.value))} className="w-full accent-amber-400" />
                <div className="flex justify-between text-[9px] text-iron-600">
                  <span>0 = Infinito</span><span>1000 MAX</span>
                </div>
              </div>

              <div>
              <label className="text-xs text-iron-400 block mb-1">
                Mín. trades: <span className="text-iron-200 font-mono">{minTradesCi}</span>
              </label>
              <input type="range" min={2} max={100} step={1} value={minTradesCi}
                onChange={(e) => setMinTradesCi(parseInt(e.target.value))}
                className="w-full accent-amber-400" />
            </div>

            <div>
              <label className="text-xs text-iron-400 block mb-1">
                Credibilidad: <span className="text-iron-200 font-mono">{(ciConfidence*100).toFixed(0)}%</span>
              </label>
              <input type="range" min={80} max={99} step={1}
                value={Math.round(ciConfidence * 100)}
                onChange={(e) => setCiConfidence(parseFloat(e.target.value) / 100)}
                className="w-full accent-amber-400" />
            </div>

            {/* Simulator */}
            <details className="group">
              <summary className="cursor-pointer text-xs text-amber-400 hover:text-amber-300 font-semibold flex items-center gap-1.5 select-none">
                <span className="transition-transform group-open:rotate-90">▶</span>
                🧪 Simulador de PnL
              </summary>
              <div className="mt-2 space-y-2">
                <p className="text-[9px] text-iron-600">Añade trades simulados (separados por coma). Se suman a los live reales sin guardar nada.</p>
                {d && (
                  <div className="flex gap-1.5 flex-wrap">
                    <span className="text-[9px] text-iron-600 self-center">🎲 Generar desde posterior:</span>
                    {[10, 30, 100].map(n => (
                      <button key={n} onClick={() => setSimPnl(generateSimPnl(d, n))}
                        className="px-2 py-0.5 text-[9px] font-mono bg-iron-800 border border-amber-500/30 text-amber-400 rounded hover:bg-iron-700 hover:border-amber-400 transition-colors">
                        {n} trades
                      </button>
                    ))}
                    {simPnl && (
                      <button onClick={() => setSimPnl(generateSimPnl(d, simPnl.split(/[,;\s]+/).filter(s => s.trim()).length))}
                        className="px-2 py-0.5 text-[9px] font-mono bg-iron-800 border border-emerald-500/30 text-emerald-400 rounded hover:bg-iron-700 hover:border-emerald-400 transition-colors">
                        🔄 Resamplear
                      </button>
                    )}
                  </div>
                )}
                <textarea
                  value={simPnl}
                  onChange={(e) => setSimPnl(e.target.value)}
                  placeholder="ej: 50, -30, 40, -20, 60"
                  className="w-full bg-iron-800 border border-iron-700 rounded-lg px-3 py-2 text-xs font-mono text-iron-200 placeholder-iron-600 resize-none h-16 focus:outline-none focus:border-amber-500"
                />
                {simPnl && (() => {
                  const vals = simPnl.split(/[,;\s]+/).map(s => parseFloat(s.trim())).filter(v => !isNaN(v));
                  const wins = vals.filter(v => v > 0);
                  const losses = vals.filter(v => v < 0);
                  const total = vals.reduce((a, b) => a + b, 0);
                  const avgWin = wins.length ? wins.reduce((a, b) => a + b, 0) / wins.length : 0;
                  const avgLoss = losses.length ? losses.reduce((a, b) => a + b, 0) / losses.length : 0;
                  return (
                    <div className="bg-iron-900/50 rounded-lg p-2 space-y-0.5 text-[9px] font-mono">
                      <div className="flex items-center justify-between">
                        <span className="text-amber-400 font-semibold font-sans">⚡ {vals.length} trades simulados</span>
                        <button onClick={() => setSimPnl('')} className="text-iron-500 hover:text-iron-300 font-sans">✕ Limpiar</button>
                      </div>
                      <div className="text-risk-green">✓ Ganadoras: {wins.length} · avg ${avgWin.toFixed(1)}</div>
                      <div className="text-risk-red">✗ Perdedoras: {losses.length} · avg ${Math.abs(avgLoss).toFixed(1)}</div>
                      <div className="text-iron-300">Win Rate: {vals.length ? ((wins.length / vals.length) * 100).toFixed(0) : 0}%</div>
                      <div className={total >= 0 ? "text-risk-green" : "text-risk-red"}>Total PnL: ${total.toFixed(2)}</div>
                    </div>
                  );
                })()}
              </div>
            </details>

            <details className="text-xs text-iron-400 mt-3 pt-3 pb-2 border-t border-iron-800">
              <summary className="font-semibold mb-2 outline-none text-iron-300">⚙️ Configuración Semáforo</summary>
              <div className="mt-2 space-y-3 pl-1 pr-1 pb-2">
                <div>
                  <label className="text-[10px] text-iron-400 block mb-1 flex justify-between items-center cursor-pointer hover:text-iron-300">
                    <div className="flex items-center gap-1.5">
                      <input type="checkbox" checked={useRedDD} onChange={(e) => setUseRedDD(e.target.checked)} className="accent-red-500 cursor-pointer" />
                      <span className={!useRedDD ? "opacity-50 line-through" : ""}>Rojo (DD):</span>
                    </div>
                    <span className={`text-red-400 font-mono ${!useRedDD ? 'opacity-50' : ''}`}>P{threshRedDD}</span>
                  </label>
                  <input type="range" min={70} max={100} step={1} value={threshRedDD} disabled={!useRedDD} onChange={(e) => setThreshRedDD(parseInt(e.target.value))} className={`w-full accent-red-500 h-1 cursor-pointer ${!useRedDD ? 'opacity-30 cursor-not-allowed' : ''}`} />
                </div>

                <div>
                  <label className="text-[10px] text-iron-400 block mb-1 flex justify-between items-center cursor-pointer hover:text-iron-300">
                    <div className="flex items-center gap-1.5">
                      <input type="checkbox" checked={useAmberDD} onChange={(e) => setUseAmberDD(e.target.checked)} className="accent-amber-500 cursor-pointer" />
                      <span className={!useAmberDD ? "opacity-50 line-through" : ""}>Ámbar (DD):</span>
                    </div>
                    <span className={`text-amber-400 font-mono ${!useAmberDD ? 'opacity-50' : ''}`}>P{threshAmberDD}</span>
                  </label>
                  <input type="range" min={50} max={95} step={1} value={threshAmberDD} disabled={!useAmberDD} onChange={(e) => setThreshAmberDD(parseInt(e.target.value))} className={`w-full accent-amber-500 h-1 cursor-pointer ${!useAmberDD ? 'opacity-30 cursor-not-allowed' : ''}`} />
                </div>

                <div className="pt-2 border-t border-iron-800/50">
                  <label className="text-[10px] text-iron-400 block mb-1 flex justify-between items-center cursor-pointer hover:text-iron-300">
                    <div className="flex items-center gap-1.5">
                      <input type="checkbox" checked={useRedStagD} onChange={(e) => setUseRedStagD(e.target.checked)} className="accent-red-500 cursor-pointer" />
                      <span className={!useRedStagD ? "opacity-50 line-through" : ""}>Rojo (Stag Días):</span>
                    </div>
                    <span className={`text-red-400 font-mono ${!useRedStagD ? 'opacity-50' : ''}`}>P{threshRedStagD}</span>
                  </label>
                  <input type="range" min={70} max={100} step={1} value={threshRedStagD} disabled={!useRedStagD} onChange={(e) => setThreshRedStagD(parseInt(e.target.value))} className={`w-full accent-red-500 h-1 cursor-pointer ${!useRedStagD ? 'opacity-30 cursor-not-allowed' : ''}`} />
                </div>

                <div>
                  <label className="text-[10px] text-iron-400 block mb-1 flex justify-between items-center cursor-pointer hover:text-iron-300">
                    <div className="flex items-center gap-1.5">
                      <input type="checkbox" checked={useAmberStagD} onChange={(e) => setUseAmberStagD(e.target.checked)} className="accent-amber-500 cursor-pointer" />
                      <span className={!useAmberStagD ? "opacity-50 line-through" : ""}>Ámbar (Stag Días):</span>
                    </div>
                    <span className={`text-amber-400 font-mono ${!useAmberStagD ? 'opacity-50' : ''}`}>P{threshAmberStagD}</span>
                  </label>
                  <input type="range" min={50} max={95} step={1} value={threshAmberStagD} disabled={!useAmberStagD} onChange={(e) => setThreshAmberStagD(parseInt(e.target.value))} className={`w-full accent-amber-500 h-1 cursor-pointer ${!useAmberStagD ? 'opacity-30 cursor-not-allowed' : ''}`} />
                </div>

                <div className="pt-2 border-t border-iron-800/50">
                  <label className="text-[10px] text-iron-400 block mb-1 flex justify-between items-center cursor-pointer hover:text-iron-300">
                    <div className="flex items-center gap-1.5">
                      <input type="checkbox" checked={useRedStagT} onChange={(e) => setUseRedStagT(e.target.checked)} className="accent-red-500 cursor-pointer" />
                      <span className={!useRedStagT ? "opacity-50 line-through" : ""}>Rojo (Stag Trades):</span>
                    </div>
                    <span className={`text-red-400 font-mono ${!useRedStagT ? 'opacity-50' : ''}`}>P{threshRedStagT}</span>
                  </label>
                  <input type="range" min={70} max={100} step={1} value={threshRedStagT} disabled={!useRedStagT} onChange={(e) => setThreshRedStagT(parseInt(e.target.value))} className={`w-full accent-red-500 h-1 cursor-pointer ${!useRedStagT ? 'opacity-30 cursor-not-allowed' : ''}`} />
                </div>

                <div>
                  <label className="text-[10px] text-iron-400 block mb-1 flex justify-between items-center cursor-pointer hover:text-iron-300">
                    <div className="flex items-center gap-1.5">
                      <input type="checkbox" checked={useAmberStagT} onChange={(e) => setUseAmberStagT(e.target.checked)} className="accent-amber-500 cursor-pointer" />
                      <span className={!useAmberStagT ? "opacity-50 line-through" : ""}>Ámbar (Stag Trades):</span>
                    </div>
                    <span className={`text-amber-400 font-mono ${!useAmberStagT ? 'opacity-50' : ''}`}>P{threshAmberStagT}</span>
                  </label>
                  <input type="range" min={50} max={95} step={1} value={threshAmberStagT} disabled={!useAmberStagT} onChange={(e) => setThreshAmberStagT(parseInt(e.target.value))} className={`w-full accent-amber-500 h-1 cursor-pointer ${!useAmberStagT ? 'opacity-30 cursor-not-allowed' : ''}`} />
                </div>

                                  <div className="pt-2 border-t border-iron-800/50">
                    <label className="text-[10px] text-iron-400 block mb-1 flex justify-between items-center cursor-pointer hover:text-iron-300">
                      <div className="flex items-center gap-1.5">
                        <input type="checkbox" checked={useRedLosses} onChange={(e) => setUseRedLosses(e.target.checked)} className="accent-red-500 cursor-pointer" />
                        <span className={!useRedLosses ? "opacity-50 line-through" : ""}>Rojo (Rachas Perd.):</span>
                      </div>
                      <span className={`text-red-400 font-mono ${!useRedLosses ? 'opacity-50' : ''}`}>P{threshRedLosses}</span>
                    </label>
                    <input type="range" min={70} max={100} step={1} value={threshRedLosses} disabled={!useRedLosses} onChange={(e) => setThreshRedLosses(parseInt(e.target.value))} className={`w-full accent-red-500 h-1 cursor-pointer ${!useRedLosses ? 'opacity-30 cursor-not-allowed' : ''}`} />
                  </div>
                  <div>
                    <label className="text-[10px] text-iron-400 block mb-1 flex justify-between items-center cursor-pointer hover:text-iron-300">
                      <div className="flex items-center gap-1.5">
                        <input type="checkbox" checked={useAmberLosses} onChange={(e) => setUseAmberLosses(e.target.checked)} className="accent-amber-500 cursor-pointer" />
                        <span className={!useAmberLosses ? "opacity-50 line-through" : ""}>Ámbar (Rachas Perd.):</span>
                      </div>
                      <span className={`text-amber-400 font-mono ${!useAmberLosses ? 'opacity-50' : ''}`}>P{threshAmberLosses}</span>
                    </label>
                    <input type="range" min={50} max={95} step={1} value={threshAmberLosses} disabled={!useAmberLosses} onChange={(e) => setThreshAmberLosses(parseInt(e.target.value))} className={`w-full accent-amber-500 h-1 cursor-pointer ${!useAmberLosses ? 'opacity-30 cursor-not-allowed' : ''}`} />
                  </div>
                  <div className="pt-2 border-t border-iron-800/50">
                  <label className="text-[10px] text-iron-400 block mb-1 flex justify-between items-center cursor-pointer hover:text-iron-300">
                    <div className="flex items-center gap-1.5">
                      <input type="checkbox" checked={useRedBayes} onChange={(e) => setUseRedBayes(e.target.checked)} className="accent-red-500 cursor-pointer" />
                      <span className={!useRedBayes ? "opacity-50 line-through" : ""}>Bayes Rojo:</span>
                    </div>
                    <span className={`text-red-400 font-mono ${!useRedBayes ? 'opacity-50' : ''}`}>&lt; {threshRedBayes}%</span>
                  </label>
                  <input type="range" min={10} max={90} step={1} value={threshRedBayes} disabled={!useRedBayes} onChange={(e) => setThreshRedBayes(parseInt(e.target.value))} className={`w-full accent-red-500 h-1 cursor-pointer ${!useRedBayes ? 'opacity-30 cursor-not-allowed' : ''}`} />
                </div>

                <div>
                  <label className="text-[10px] text-iron-400 block mb-1 flex justify-between items-center cursor-pointer hover:text-iron-300">
                    <div className="flex items-center gap-1.5">
                      <input type="checkbox" checked={useAmberBayes} onChange={(e) => setUseAmberBayes(e.target.checked)} className="accent-amber-500 cursor-pointer" />
                      <span className={!useAmberBayes ? "opacity-50 line-through" : ""}>Bayes Ámbar:</span>
                    </div>
                    <span className={`text-amber-400 font-mono ${!useAmberBayes ? 'opacity-50' : ''}`}>&lt; {threshAmberBayes}%</span>
                  </label>
                  <input type="range" min={50} max={95} step={1} value={threshAmberBayes} disabled={!useAmberBayes} onChange={(e) => setThreshAmberBayes(parseInt(e.target.value))} className={`w-full accent-amber-500 h-1 cursor-pointer ${!useAmberBayes ? 'opacity-30 cursor-not-allowed' : ''}`} />
                </div>
                
                <div className="pt-2 border-t border-iron-800/50">
                  <label className="text-[10px] text-iron-400 block mb-1 flex justify-between items-center cursor-pointer hover:text-iron-300">
                    <div className="flex items-center gap-1.5">
                      <input type="checkbox" checked={useRedConsist} onChange={(e) => setUseRedConsist(e.target.checked)} className="accent-red-500 cursor-pointer" />
                      <span className={!useRedConsist ? "opacity-50 line-through" : ""}>Test P-value (Rojo):</span>
                    </div>
                    <span className={`text-red-400 font-mono ${!useRedConsist ? 'opacity-50' : ''}`}>&lt; {threshRedConsist}</span>
                  </label>
                  <input type="range" min={0.01} max={0.10} step={0.01} value={threshRedConsist} disabled={!useRedConsist} onChange={(e) => setThreshRedConsist(parseFloat(e.target.value))} className={`w-full accent-red-500 h-1 cursor-pointer ${!useRedConsist ? 'opacity-30 cursor-not-allowed' : ''}`} />
                </div>

                <div>
                  <label className="text-[10px] text-iron-400 block mb-1 flex justify-between items-center cursor-pointer hover:text-iron-300">
                    <div className="flex items-center gap-1.5">
                      <input type="checkbox" checked={useAmberConsist} onChange={(e) => setUseAmberConsist(e.target.checked)} className="accent-amber-500 cursor-pointer" />
                      <span className={!useAmberConsist ? "opacity-50 line-through" : ""}>Test P-value (Ámbar):</span>
                    </div>
                    <span className={`text-amber-400 font-mono ${!useAmberConsist ? 'opacity-50' : ''}`}>&lt; {threshAmberConsist}</span>
                  </label>
                  <input type="range" min={0.05} max={0.25} step={0.01} value={threshAmberConsist} disabled={!useAmberConsist} onChange={(e) => setThreshAmberConsist(parseFloat(e.target.value))} className={`w-full accent-amber-500 h-1 cursor-pointer ${!useAmberConsist ? 'opacity-30 cursor-not-allowed' : ''}`} />
                </div>
              </div>
            </details>

            <button
              onClick={() => fetchBayes()}
              disabled={!selectedId || loading}
              className="w-full bg-[#00aaff] hover:bg-[#0088dd] disabled:bg-iron-700 disabled:text-iron-500 text-white font-semibold py-2.5 rounded-lg transition-colors text-sm"
            >
              {loading ? "⏳ Calculando..." : "🔬 Evaluar"}
            </button>

            {error && <p className="text-risk-red text-xs mt-2">{error}</p>}
          </div>
        </div>

        {/* Main Results */}
        <div className="lg:col-span-2 space-y-4">
          {d ? (
            <>
              {/* Veredicto Maestro */}
              {data?.historical_risk && data.historical_risk.length > 0 && (
                <div className="bg-iron-900 border border-iron-800 rounded-xl p-4 flex items-center gap-4 shadow-xl">
                  {(() => {
                    const lastRisk = data.historical_risk[data.historical_risk.length - 1];
                    const status = lastRisk.status;
                    return (
                      <>
                        <div className={`flex flex-col justify-center items-center p-3 rounded-xl min-w-[120px] ${
                          status === 'red' ? 'bg-red-500/10 border border-red-500/30' :
                          status === 'amber' ? 'bg-amber-500/10 border border-amber-500/30' :
                          'bg-emerald-500/10 border border-emerald-500/30'
                        }`}>
                          <div className={`text-3xl mb-1 ${
                            status === 'red' ? 'text-red-500' :
                            status === 'amber' ? 'text-amber-500' :
                            'text-emerald-500'
                          }`}>
                            {status === 'red' ? '🔴' : status === 'amber' ? '🟡' : '🟢'}
                          </div>
                          <div className={`font-mono font-bold tracking-widest text-sm ${
                            status === 'red' ? 'text-red-400' :
                            status === 'amber' ? 'text-amber-400' :
                            'text-emerald-400'
                          }`}>
                            {status === 'red' ? 'PAUSAR' : status === 'amber' ? 'VIGILAR' : 'OPERAR'}
                          </div>
                        </div>
                        <div className="flex-1">
                          <h3 className="text-iron-200 font-bold mb-1 text-sm">Veredicto Maestro de Riesgo</h3>
                          <div className="text-[11px] text-iron-400 space-y-1">
                            {lastRisk.reasons.map((r, i) => (
                              <div key={i} className="flex items-center gap-2">
                                <div className="w-1 h-1 rounded-full bg-iron-600" />
                                <span>{r}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}

              {/* Unified P(EV > 0) Card */}
              <div className="bg-surface-secondary border border-iron-700 rounded-xl p-6 space-y-5">
                {/* Gauge */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <h2 className="text-sm font-semibold text-iron-300">P(E(X) &gt; 0)</h2>
                      <p className="text-[10px] text-iron-600">Probabilidad de que el edge sea positivo</p>
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
                    <span>0% — Edge muerto</span>
                    <span>100% — Edge confirmado</span>
                  </div>
                </div>

                {/* Consistency Tests Strip */}
                {data?.consistency_tests && Object.keys(data.consistency_tests).length > 0 && (
                  <>
                    <div className="border-t border-iron-700" />
                    <div>
                      <h3 className="text-xs font-semibold text-iron-300 mb-2 inline-flex items-center gap-1.5 cursor-help" title="Módulo de Tests de Hipótesis. Compara la realidad actual (Live) contra la simulación analítica (Backtest) para detectar si el mercado ha cambiado y has perdido tu ventaja inicial (Edge Decay).">
                        🛡️ Guardián Backtest ↔ Live <span className="text-[10px] text-iron-600 border border-iron-700 bg-surface-tertiary rounded px-1 ml-1 cursor-help">?</span>
                      </h3>
                      <p className="text-[9px] text-iron-600 mb-2">¿Tus resultados live son consistentes con lo que el Backtest prometía?</p>
                      <div className="grid grid-cols-3 gap-2">
                        {Object.entries(data.consistency_tests).map(([key, test]: [string, any]) => {
                          const icon = test.status === "green" ? "🟢" : test.status === "amber" ? "🟡" : "🔴";
                          const msg = test.status === "green" ? "Consistente" : test.status === "amber" ? "Vigilar" : "Inconsistente";
                          const bgColor = test.status === "green" ? "border-emerald-500/20" : test.status === "amber" ? "border-amber-500/20" : "border-red-500/30 bg-red-500/5";
                          return (
                            <div 
                              key={key} 
                              className={`rounded-lg border p-2 ${bgColor}`}
                              title={test.label_key === 'winRate' ? `"Si el Backtest dice Win Rate = p, ¿qué probabilidad hay de ver este número de wins en los trades actuales?"` : test.label_key === 'streak' ? `"Si el Backtest dice que gano el X% de las veces, ¿es normal ver tantas pérdidas seguidas?"` : `"¿El PnL medio live es consistente con el PnL medio del Backtest?"`}
                            >
                              <div className="text-[9px] text-iron-500 font-semibold">{test.label}</div>
                              <div 
                                className="text-[11px] font-mono font-bold text-iron-200 mt-0.5" 
                                title="Estado estadístico de la prueba. Si el p-value cae por debajo del 10% pasa a VIGILAR (Ámbar). Si cae por debajo del 2%, el Guardián marcará la estrategia como INCONSISTENTE (Roja)."
                              >
                                {icon} <span className="border-b border-dashed border-iron-700 cursor-help pb-px">{msg}</span>
                              </div>
                              <div className="text-[8px] text-iron-600 mt-0.5">
                                Live: <span className="text-iron-400">{test.observed}</span>
                              </div>
                              <div className="text-[8px] text-iron-600">
                                Backtest: <span className="text-iron-400">{test.expected}</span>
                              </div>
                              <div className="text-[8px] text-iron-600 mt-0.5">
                                <span className="border-b border-dashed border-iron-600 cursor-help pb-px" title="Probabilidad (P-Value). Mide el % de posibilidades de que tus resultados reales sean tan malos si el Backtest fuera 100% cierto. Un porcentaje bajo significa que el mercado real te está castigando y te desvías de la simulación.">
                                  p-value
                                </span> = <span className={`font-mono ${test.status === "red" ? "text-red-400 font-bold" : test.status === "amber" ? "text-amber-400 font-bold" : "text-iron-400"}`}>
                                  {(test.p_value * 100).toFixed(1)}%
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                      <details className="mt-2">
                        <summary className="cursor-pointer text-[9px] text-iron-600 hover:text-iron-400 select-none">
                          ▶ ¿Cómo se calcula cada test?
                        </summary>
                        <div className="mt-2 space-y-2 text-[9px] text-iron-500">
                          <div className="bg-surface-tertiary rounded-lg p-2">
                            <div className="font-semibold text-iron-300 mb-1">1. Win Rate — Test Binomial</div>
                            <div>Pregunta: <em>"Si el Backtest dice Win Rate = p, ¿qué probabilidad hay de ver ≤ k wins en n trades?"</em></div>
                            <div className="font-mono mt-1 text-iron-400">p_value = Binomial.CDF(k=wins_live, n=trades_live, p=Win_Rate_backtest)</div>
                            <div className="mt-1">Si p &lt; 2% → 🔴 el Win Rate live es anormalmente bajo respecto al Backtest.<br/>Si p &lt; 10% → 🟡 sospechoso, vigilar.<br/>Si p &gt; 10% → 🟢 normal.</div>
                            {data?.consistency_tests?.win_rate && (
                              <PValueGauge pValue={data.consistency_tests.win_rate.p_value} label="Win Rate" />
                            )}
                          </div>
                          <div className="bg-surface-tertiary rounded-lg p-2 space-y-1.5">
                            <div className="font-semibold text-iron-300 mb-1">2. Racha Pérdidas — Probabilidad geométrica</div>
                            <div>Pregunta: <em>"Si el Backtest dice que gano el {data?.consistency_tests?.consec_losses?.expected || 'X%'} de las veces, ¿es normal ver tantas pérdidas seguidas?"</em></div>
                            <div className="mt-1"><strong className="text-iron-300">Lógica paso a paso:</strong></div>
                            <div>Si tu Win Rate real fuese el del Backtest, cada trade tiene un <strong className="text-iron-200">{data?.consistency_tests?.consec_losses ? `${(100 - parseFloat(data.consistency_tests.consec_losses.expected.replace(/[^0-9.]/g, ''))).toFixed(0)}%` : 'X%'}</strong> de ser pérdida.</div>
                            <div>Para que se encadenen <strong>k pérdidas seguidas</strong>, esa probabilidad se multiplica k veces:</div>
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
                                  <div>Racha observada: <span className="text-iron-200">{k} pérdidas seguidas</span></div>
                                  <div>Prob. de perder 1 vez: <span className="text-iron-200">{(lossRate*100).toFixed(0)}%</span></div>
                                  <div>Prob. de 2 seguidas: {(lossRate*100).toFixed(0)}% × {(lossRate*100).toFixed(0)}% = <span className="text-iron-200">{(Math.pow(lossRate, 2) * 100).toFixed(1)}%</span></div>
                                  <div>Prob. de {k} seguidas: {(lossRate*100).toFixed(0)}%<sup>{k}</sup> = <span className="text-iron-200">{(pRaw * 100).toFixed(3)}%</span> <span className="text-iron-600">(prob. pura)</span></div>
                                  <div className="border-t border-iron-700 pt-1 mt-1">
                                    Ventanas donde podía empezar: {data.live_trades_total} − {k} + 1 = <span className="text-iron-200">{windows}</span>
                                  </div>
                                  <div>
                                    p = {windows} × {(pRaw * 100).toFixed(3)}% = <span className={t.status === 'red' ? 'text-red-400 font-bold' : t.status === 'amber' ? 'text-amber-400' : 'text-iron-200'}>{(pFinal * 100).toFixed(3)}%</span>
                                  </div>
                                </div>
                              );
                            })()}
                            <div>Si p &lt; 2% → 🔴 racha extremadamente rara, el Backtest probablemente no refleja la realidad.<br/>Si p &lt; 10% → 🟡 racha inusual, vigilar.<br/>Si p &gt; 10% → 🟢 racha dentro de lo esperable.</div>
                            {data?.consistency_tests?.consec_losses && (
                              <PValueGauge pValue={data.consistency_tests.consec_losses.p_value} label="Racha" />
                            )}
                          </div>
                          <div className="bg-surface-tertiary rounded-lg p-2">
                            <div className="font-semibold text-iron-300 mb-1">3. PnL Medio — z-test Normal</div>
                            <div>Pregunta: <em>"¿El PnL medio live es consistente con el PnL medio del Backtest?"</em></div>
                            <div className="font-mono mt-1 text-iron-400">z = (avg_live − avg_bt) / (σ_bt / √n)<br/>p_value = Φ(z)</div>
                            <div className="mt-1">Compara la media live contra la media del Backtest ajustando por el tamaño muestral.<br/>Un z-score muy negativo → evidencia de que el rendimiento live es peor que el Backtest.</div>
                            {data?.consistency_tests?.avg_pnl && (
                              <PValueGauge pValue={data.consistency_tests.avg_pnl.p_value} label="PnL Medio" />
                            )}
                          </div>
                          <div className="bg-iron-800/50 rounded-lg p-2 text-iron-600">
                            <strong className="text-iron-400">Interpretación del p-value:</strong> Es la probabilidad de ver resultados <em>así de malos o peores</em> si el Backtest fuera real.
                            Un p = 2% significa que solo hay un 2% de probabilidad de que estos resultados ocurran si la estrategia realmente funciona como en el Backtest.
                          </div>
                        </div>
                      </details>
                    </div>
                  </>
                )}

                {/* Divider */}
                <div className="border-t border-iron-700" />

                {/* IC and Live Equity */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h3 className="text-sm font-semibold text-iron-200">📊 Intervalo de Credibilidad del EV</h3>
                    <p className="text-[10px] text-iron-500 mb-3">
                      Rango donde se encuentra el valor esperado por trade con un {(d.confidence*100).toFixed(0)}% de probabilidad.
                    </p>
                    <GaussianChart
                      lower={d.ev_lower} upper={d.ev_upper} mean={d.ev_mean}
                      std={d.ev_std}
                      label="E(X)"
                      height={180}
                      hideIcFill
                      shadeAbove={0}
                      shadeAboveColor="#10b981"
                      shadeAboveLabel={`P(E(X)>0) = ${(d.p_positive * 100).toFixed(1)}%`}
                      shadeBelow={0}
                      shadeBelowColor="#ef4444"
                      shadeBelowLabel={`P(E(X)<0) = ${((1 - d.p_positive) * 100).toFixed(1)}%`}
                      refLines={[
                        { x: d.ev_lower, color: "#f59e0b", dashed: true, hideLegend: true },
                        { x: d.ev_upper, color: "#f59e0b", dashed: true, hideLegend: true },
                      ]}
                    />
                  </div>
                  
                  {data?.live_equity_curve && (
                    <div>
                      <h3 className="text-sm font-semibold text-iron-200">📈 Equity Curve & P(EV&gt;0)</h3>
                      <p className="text-[10px] text-iron-500 mb-3">
                        Línea naranja = Evolución de la probabilidad P(EV&gt;0) tras {data.live_trades_total} trades evaluados en el posterior.
                      </p>
                      <LiveEquityArea data={data.live_equity_curve} pPositiveCurve={data.p_positive_curve} historicalRisk={data.historical_risk} />
                    </div>
                  )}
                </div>

                {/* Divider */}
                <div className="border-t border-iron-700 mt-4" />

                {/* Collapsible step-by-step breakdown */}
                <details className="group">
                  <summary className="cursor-pointer text-xs text-[#00aaff] hover:text-[#00ccff] font-semibold flex items-center gap-1.5 select-none">
                    <span className="transition-transform group-open:rotate-90">▶</span>
                    📐 Ver desglose paso a paso del cálculo
                  </summary>
                  <div className="mt-3 space-y-4 border-l-2 border-iron-700 pl-4">

                    {/* Variable glossary */}
                    <div className="bg-iron-800/60 rounded-lg p-2.5 text-[9px] font-mono text-iron-500 grid grid-cols-2 gap-x-4 gap-y-0.5">
                      <div><span className="text-[#00aaff] font-semibold">Win Rate</span> = Probabilidad de ganar</div>
                      <div><span className="text-risk-green font-semibold">W</span> = Avg Win (ganancia media por trade ganador)</div>
                      <div><span className="text-risk-red font-semibold">L</span> = Avg Loss (pérdida media por trade perdedor)</div>
                      <div><span className="text-[#00ffaa] font-semibold">E(X)</span> = Expected Value = Win Rate × W − (1−Win Rate) × L</div>
                    </div>

                    {/* STEP 1: Win Rate */}
                    <div className="space-y-1">
                      <div className="text-[11px] font-semibold text-iron-200">
                        Paso 1 — Win Rate
                      </div>
                      <div className="text-[10px] text-iron-500">
                        Modelo: <span className="text-iron-300 font-mono">Beta-Bernoulli conjugado</span>.
                        Cada trade es win o loss. La Beta es el prior natural — no requiere test de bondad de ajuste.
                      </div>
                      <div className="bg-surface-tertiary rounded-lg p-3 text-xs font-mono space-y-1">
                        <div className="text-iron-600 text-[9px] font-sans font-semibold mb-1">DATOS DE ENTRADA</div>
                        <div className="text-iron-500">Backtest: <span className="text-iron-300">{d.n_bt_wins}</span> wins + <span className="text-iron-300">{d.n_bt_losses}</span> losses = {d.n_bt_wins + d.n_bt_losses} trades</div>
                        <div className="text-iron-500">Live: <span className="text-iron-300">{d.n_live_wins}</span> wins + <span className="text-iron-300">{d.n_live_losses}</span> losses = {d.n_live_wins + d.n_live_losses} trades</div>
                        <div className="text-iron-500">Confianza Backtest: {Math.round(100/d.bt_discount)}% → cada trade Backtest vale {(1/d.bt_discount).toFixed(2)} trades live</div>

                        <div className="text-iron-600 text-[9px] font-sans font-semibold mt-2 mb-1">PRIOR (solo Backtest descontado)</div>
                        {maxBtTrades > 0 && Math.round((d.n_bt_wins + d.n_bt_losses) / d.bt_discount) > maxBtTrades ? (
                           <div className="text-iron-500 mb-1 text-[9px] bg-amber-500/10 p-1 rounded border border-amber-500/20 text-amber-400">
                             ⚠️ Prior capado a {maxBtTrades} trades efectivos.
                           </div>
                        ) : null}
                        <div className="text-iron-500">α₀ = <span className="text-iron-300">{d.eff_bt_wins.toFixed(2)}</span></div>
                        <div className="text-iron-500">β₀ = <span className="text-iron-300">{d.eff_bt_losses.toFixed(2)}</span></div>
                        <div className="text-iron-400">
                          Prior: Beta({d.eff_bt_wins}, {d.eff_bt_losses}) → Win Rate_prior = <span className="text-amber-400 font-semibold">{pct(d.eff_bt_wins / (d.eff_bt_wins + d.eff_bt_losses))}</span>
                        </div>

                        <div className="text-iron-600 text-[9px] font-sans font-semibold mt-2 mb-1">POSTERIOR (Backtest + Live)</div>
                        <div className="text-iron-500">α = α₀ + wins_live = {d.eff_bt_wins.toFixed(2)} + {d.n_live_wins} = <span className="text-iron-300">{d.theta_alpha.toFixed(2)}</span></div>
                        <div className="text-iron-500">β = β₀ + losses_live = {d.eff_bt_losses.toFixed(2)} + {d.n_live_losses} = <span className="text-iron-300">{d.theta_beta.toFixed(2)}</span></div>
                        <div className="text-iron-300 border-t border-iron-700 pt-1 mt-1">
                          Posterior: Beta({d.theta_alpha.toFixed(2)}, {d.theta_beta.toFixed(2)}) → <span className="text-[#00aaff] font-semibold">Win Rate = {pct(d.theta_mean)}</span>
                        </div>
                        <div className="text-iron-500 text-[9px]">
                          IC {(d.confidence*100).toFixed(0)}%: [{pct(d.theta_lower)}, {pct(d.theta_upper)}]
                        </div>
                        <div className="text-iron-600 text-[9px] font-sans font-semibold mt-2 mb-1">VARIANZA (se usará en Paso 4)</div>
                        <div className="text-iron-500 text-[9px]">
                          Var[Win Rate] = α·β / ((α+β)²·(α+β+1))
                        </div>
                        <div className="text-iron-400 text-[9px]">
                          = {d.theta_alpha.toFixed(0)}·{d.theta_beta.toFixed(0)} / (({d.theta_alpha.toFixed(0)}+{d.theta_beta.toFixed(0)})²·({(d.theta_alpha + d.theta_beta).toFixed(0)}+1))
                        </div>
                        <div className="text-[#00aaff] text-[9px] font-semibold">
                          Var[Win Rate] = {d.theta_var.toFixed(6)}
                        </div>
                      </div>
                      <BetaDistChart
                        priorA={d.eff_bt_wins} priorB={d.eff_bt_losses}
                        postA={d.theta_alpha} postB={d.theta_beta}
                        icLower={d.theta_lower} icUpper={d.theta_upper}
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="text-[11px] font-semibold text-iron-200">
                        Paso 2 — W (Ganancia Media por Trade)
                      </div>
                      <div className="text-[10px] text-iron-500">
                        Modelo: <span className="text-iron-300 font-mono">Normal-Inverse-Gamma conjugado → t-Student posterior</span>.
                        La t-Student NO es asumida — es consecuencia matemática del NIG.
                        La asunción es que la <strong className="text-iron-300">distribución de la MEDIA</strong> es Normal, garantizado por el Teorema Central del Límite (TCL) para n &gt; 30.
                      </div>
                      <div className="bg-surface-tertiary rounded-lg p-3 text-xs font-mono space-y-1">
                        <div className="text-iron-600 text-[9px] font-sans font-semibold mb-1">DATOS DE ENTRADA</div>
                        <div className="text-iron-500">Backtest: <span className="text-iron-300">{d.n_bt_wins}</span> trades ganadores → media = <span className="text-iron-300">{usd(d.avg_win_bt)}</span></div>
                        <div className="text-iron-500">Live: <span className="text-iron-300">{d.avg_win_n > 0 ? `${d.avg_win_n} trades ganadores → media = ${usd(d.avg_win_live!)}` : "sin datos live todavía"}</span></div>
                        <div className="text-iron-500">Confianza Backtest: {Math.round(100/d.bt_discount)}% → {d.n_bt_wins} wins Backtest pesan como <span className="text-iron-300">{Math.round(d.n_bt_wins / d.bt_discount)}</span> wins equivalentes</div>

                        <div className="text-iron-600 text-[9px] font-sans font-semibold mt-2 mb-1">CÁLCULO DE LA MEDIA POSTERIOR</div>
                        <div className="text-iron-500 text-[9px] font-sans">
                          La media posterior es una <strong className="text-iron-300">media ponderada</strong> entre el Backtest (descontado) y los datos live:
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
                        <div className="text-iron-500 text-[9px] border-t border-iron-700 pt-1 mt-1">
                          IC {(d.confidence*100).toFixed(0)}%: [<span className="text-iron-300">{usd(d.avg_win_lower)}</span>, <span className="text-iron-300">{usd(d.avg_win_upper)}</span>]
                        </div>
                        {d.avg_win_live !== null && (
                          <div className="text-iron-600 text-[9px] font-sans">
                            Δ vs Backtest puro: {usd(d.avg_win_mean - d.avg_win_bt)} ({d.avg_win_mean > d.avg_win_bt ? "↑ subió" : "↓ bajó"})
                          </div>
                        )}
                        <div className="text-iron-600 text-[9px] font-sans font-semibold mt-2 mb-1">VARIANZA (se usará en Paso 4)</div>
                        {(() => {
                          const nEff = Math.round(d.n_bt_wins / d.bt_discount) + d.avg_win_n;
                          const s2 = d.avg_win_var * nEff; // reverse: s² = Var[media] × n
                          return (
                            <div className="text-[9px] space-y-0.5">
                              <div className="text-iron-500 font-sans">
                                La varianza de la media se calcula como:
                              </div>
                              <div className="text-iron-400 font-mono bg-iron-800/40 rounded px-2 py-1">
                                Var[W] = s²<sub>wins</sub> / n<sub>eff</sub>
                              </div>
                              <div className="text-iron-500 font-sans">donde:</div>
                              <div className="text-iron-400 pl-2 space-y-0.5">
                                <div>
                                  s²<sub>wins</sub> = <span className="text-iron-300 font-semibold">{s2.toFixed(2)}</span>
                                  <span className="text-iron-600"> ← dispersión de los {d.n_bt_wins} trades ganadores del Backtest (se usan TODOS, no se descuentan)</span>
                                </div>
                                <div>
                                  n<sub>eff</sub> = <span className="text-iron-300 font-semibold">{nEff}</span>
                                  <span className="text-iron-600"> ← aquí SÍ se descuenta: {d.n_bt_wins} Backtest / {d.bt_discount} = {Math.round(d.n_bt_wins / d.bt_discount)}{d.avg_win_n > 0 ? ` + ${d.avg_win_n} live` : ''}</span>
                                </div>
                              </div>
                              <div className="text-iron-600 font-sans bg-iron-800/30 rounded p-1.5 mt-1">
                                💡 s² mide cuánto varían los trades entre sí (eso el Backtest lo mide bien), pero n<sub>eff</sub> refleja cuánto confiamos en la media del Backtest ({nEff} vs {d.n_bt_wins} reales).
                              </div>
                              <div className="text-iron-400 font-mono mt-1">
                                Var[W] = {s2.toFixed(2)} / {nEff} = <span className="text-risk-green font-semibold">{d.avg_win_var.toFixed(4)}</span>
                              </div>
                              <div className="text-iron-500">
                                σ<sub>W</sub> = √Var = <span className="text-risk-green font-semibold">{usd(Math.sqrt(d.avg_win_var))}</span>
                              </div>
                              <div className="text-iron-600 font-sans mt-1">
                                Verificación: IC = W ± t × σ ≈ {usd(d.avg_win_mean)} ± {usd(d.avg_win_mean - d.avg_win_lower)} = [{usd(d.avg_win_lower)}, {usd(d.avg_win_upper)}] ✅
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
                        refLines={[{ x: d.avg_win_bt, color: "#f59e0b", label: `BT (${usd(d.avg_win_bt)})`, dashed: true }]}
                      />
                    </div>

                    {/* STEP 3: AvgLoss */}
                    <div className="space-y-1">
                      <div className="text-[11px] font-semibold text-iron-200">
                        Paso 3 — L (Pérdida Media por Trade)
                      </div>
                      <div className="text-[10px] text-iron-500">
                        Mismo modelo NIG que el paso 2. Las pérdidas se tratan como valores absolutos (positivos) para facilitar la interpretación.
                      </div>
                      <div className="bg-surface-tertiary rounded-lg p-3 text-xs font-mono space-y-1">
                        <div className="text-iron-600 text-[9px] font-sans font-semibold mb-1">DATOS DE ENTRADA</div>
                        <div className="text-iron-500">Backtest: <span className="text-iron-300">{d.n_bt_losses}</span> trades perdedores → media = <span className="text-iron-300">{usd(d.avg_loss_bt)}</span></div>
                        <div className="text-iron-500">Live: <span className="text-iron-300">{d.avg_loss_n > 0 ? `${d.avg_loss_n} trades perdedores → media = ${usd(d.avg_loss_live!)}` : "sin datos live todavía"}</span></div>
                        <div className="text-iron-500">Confianza Backtest: {Math.round(100/d.bt_discount)}% → {d.n_bt_losses} losses Backtest pesan como <span className="text-iron-300">{Math.round(d.n_bt_losses / d.bt_discount)}</span> losses equivalentes</div>

                        <div className="text-iron-600 text-[9px] font-sans font-semibold mt-2 mb-1">CÁLCULO DE LA MEDIA POSTERIOR</div>
                        <div className="text-iron-500 text-[9px] font-sans">
                          Media ponderada Backtest (descontado) + Live:
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
                        <div className="text-iron-500 text-[9px] border-t border-iron-700 pt-1 mt-1">
                          IC {(d.confidence*100).toFixed(0)}%: [<span className="text-iron-300">{usd(d.avg_loss_lower)}</span>, <span className="text-iron-300">{usd(d.avg_loss_upper)}</span>]
                        </div>
                        {d.avg_loss_live !== null && (
                          <div className="text-iron-600 text-[9px] font-sans">
                            Δ vs Backtest puro: {usd(d.avg_loss_mean - d.avg_loss_bt)} ({d.avg_loss_mean > d.avg_loss_bt ? "↑ pérdida mayor" : "↓ pérdida menor"})
                          </div>
                        )}
                        <div className="text-iron-600 text-[9px] font-sans font-semibold mt-2 mb-1">VARIANZA (se usará en Paso 4)</div>
                        {(() => {
                          const nEff = Math.round(d.n_bt_losses / d.bt_discount) + d.avg_loss_n;
                          const s2 = d.avg_loss_var * nEff;
                          return (
                            <div className="text-[9px] space-y-0.5">
                              <div className="text-iron-500 font-sans">
                                La varianza de la media se calcula como:
                              </div>
                              <div className="text-iron-400 font-mono bg-iron-800/40 rounded px-2 py-1">
                                Var[L] = s²<sub>losses</sub> / n<sub>eff</sub>
                              </div>
                              <div className="text-iron-500 font-sans">donde:</div>
                              <div className="text-iron-400 pl-2 space-y-0.5">
                                <div>
                                  s²<sub>losses</sub> = <span className="text-iron-300 font-semibold">{s2.toFixed(2)}</span>
                                  <span className="text-iron-600"> ← dispersión de los {d.n_bt_losses} trades perdedores del Backtest (se usan TODOS, no se descuentan)</span>
                                </div>
                                <div>
                                  n<sub>eff</sub> = <span className="text-iron-300 font-semibold">{nEff}</span>
                                  <span className="text-iron-600"> ← aquí SÍ se descuenta: {d.n_bt_losses} Backtest / {d.bt_discount} = {Math.round(d.n_bt_losses / d.bt_discount)}{d.avg_loss_n > 0 ? ` + ${d.avg_loss_n} live` : ''}</span>
                                </div>
                              </div>
                              <div className="text-iron-600 font-sans bg-iron-800/30 rounded p-1.5 mt-1">
                                💡 s² mide cuánto varían los trades entre sí (eso el Backtest lo mide bien), pero n<sub>eff</sub> refleja cuánto confiamos en la media del Backtest ({nEff} vs {d.n_bt_losses} reales).
                              </div>
                              <div className="text-iron-400 font-mono mt-1">
                                Var[L] = {s2.toFixed(2)} / {nEff} = <span className="text-risk-red font-semibold">{d.avg_loss_var.toFixed(4)}</span>
                              </div>
                              <div className="text-iron-500">
                                σ<sub>L</sub> = √Var = <span className="text-risk-red font-semibold">{usd(Math.sqrt(d.avg_loss_var))}</span>
                              </div>
                              <div className="text-iron-600 font-sans mt-1">
                                Verificación: IC = L ± t × σ ≈ {usd(d.avg_loss_mean)} ± {usd(d.avg_loss_mean - d.avg_loss_lower)} = [{usd(d.avg_loss_lower)}, {usd(d.avg_loss_upper)}] ✅
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
                      <div className="text-[11px] font-semibold text-iron-200">
                        Paso 4 — E(X) Expected Value (Método Delta)
                      </div>
                      <div className="text-[10px] text-iron-500">
                        Propagación de incertidumbre analítica. Asume independencia entre Win Rate, W y L.
                      </div>
                      <div className="bg-surface-tertiary rounded-lg p-3 text-xs font-mono space-y-1">
                        <div className="text-iron-600 text-[9px] font-sans font-semibold mb-1">FÓRMULA</div>
                        <div className="text-iron-400">E(X) = Win Rate × W − (1 − Win Rate) × L</div>
                        <div className="text-iron-400">E(X) = {pct(d.theta_mean)} × {usd(d.avg_win_mean)} − {pct(1-d.theta_mean)} × {usd(d.avg_loss_mean)}</div>
                        <div className="text-[#00ffaa] font-semibold text-sm border-t border-iron-700 pt-1 mt-1">
                          E(X) = {usd(d.ev_mean)} por trade
                        </div>

                        <div className="text-iron-600 text-[9px] font-sans font-semibold mt-3 mb-1">INCERTIDUMBRE (Método Delta)</div>
                        <div className="text-iron-500 text-[9px] font-sans mb-1">
                          σ se calcula propagando la incertidumbre de cada variable (Win Rate, W, L) usando una aproximación de Taylor de primer orden:
                        </div>
                        <div className="text-iron-400 text-[10px]">Var[E(X)] = W² × Var[Win Rate] + Win Rate² × Var[W] + L² × Var[Win Rate] + (1−Win Rate)² × Var[L]</div>
                        <div className="bg-iron-800/60 rounded p-2 mt-1 space-y-1.5 text-[9px]">
                          <div>
                            <div className="text-iron-500">
                              Var[Win Rate] = <span className="text-iron-300 font-semibold">{d.theta_var.toFixed(6)}</span>
                              <span className="text-iron-600 ml-2">← del Paso 1 (Beta posterior)</span>
                            </div>
                            <div className="text-iron-600 pl-2">
                              = α·β / ((α+β)²·(α+β+1)) = {d.theta_alpha.toFixed(0)}·{d.theta_beta.toFixed(0)} / (({d.theta_alpha.toFixed(0)}+{d.theta_beta.toFixed(0)})²·({(d.theta_alpha + d.theta_beta).toFixed(0)}+1))
                            </div>
                          </div>
                          <div>
                            <div className="text-iron-500">
                              Var[W] = <span className="text-iron-300 font-semibold">{d.avg_win_var.toFixed(4)}</span>
                              <span className="text-iron-600 ml-2">← del Paso 2 (t-Student / NIG posterior)</span>
                            </div>
                            <div className="text-iron-600 pl-2">
                              = escala² de la t-Student posterior para la media de ganancias ({d.avg_win_n} wins live)
                            </div>
                          </div>
                          <div>
                            <div className="text-iron-500">
                              Var[L] = <span className="text-iron-300 font-semibold">{d.avg_loss_var.toFixed(4)}</span>
                              <span className="text-iron-600 ml-2">← del Paso 3 (t-Student / NIG posterior)</span>
                            </div>
                            <div className="text-iron-600 pl-2">
                              = escala² de la t-Student posterior para la media de pérdidas ({d.avg_loss_n} losses live)
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
                        <div className="text-iron-500 text-[9px] mt-1">
                          IC = E(X) ± z × σ = {usd(d.ev_mean)} ± {(1.96).toFixed(2)} × {usd(d.ev_std)} = [{usd(d.ev_lower)}, {usd(d.ev_upper)}]
                        </div>
                      </div>
                      <GaussianChart
                        mean={d.ev_mean} std={d.ev_std}
                        lower={d.ev_lower} upper={d.ev_upper}
                        label="E(X)"
                      />
                    </div>
                    <div className="space-y-1">
                      <div className="text-[11px] font-semibold text-iron-200">
                        Paso 5 — P(E(X) &gt; 0)
                      </div>
                      <div className="text-[10px] text-iron-500">
                        Sale de la misma distribución Normal del paso 4 → <strong className="text-iron-300">nunca contradice al IC</strong>.
                      </div>
                      <div className="bg-surface-tertiary rounded-lg p-3 text-xs font-mono space-y-1">
                        <div className="text-iron-600 text-[9px] font-sans font-semibold mb-1">¿QUÉ ES Φ?</div>
                        <div className="text-iron-500 text-[9px] font-sans">
                          Φ es la <strong className="text-iron-300">función de distribución acumulada (CDF)</strong> de la Normal.
                          Φ(x) = "¿qué porcentaje del área de la campana queda a la IZQUIERDA de x?"
                        </div>

                        <div className="text-iron-600 text-[9px] font-sans font-semibold mt-2 mb-1">CÁLCULO PASO A PASO</div>
                        <div className="text-iron-500 text-[9px] font-sans">
                          Del paso 4 sabemos que E(X) se distribuye como una Normal con:
                        </div>
                        <div className="text-iron-400 pl-2">
                          <div>μ = <span className="text-iron-300">{usd(d.ev_mean)}</span> <span className="text-iron-600">(la media)</span></div>
                          <div>σ = <span className="text-iron-300">{usd(d.ev_std)}</span> <span className="text-iron-600">(la incertidumbre)</span></div>
                        </div>

                        <div className="text-iron-500 text-[9px] font-sans mt-1">
                          Pregunta: <em className="text-iron-300">"¿Cuánta área de la campana queda por encima de $0?"</em>
                        </div>

                        {(() => {
                          const z = (0 - d.ev_mean) / d.ev_std;
                          return (
                            <div className="bg-iron-800/40 rounded p-2 mt-1 space-y-0.5">
                              <div className="text-iron-600 text-[9px] font-sans font-semibold">1. Normalizamos el 0 a unidades de σ (z-score):</div>
                              <div className="text-iron-400">
                                z = (0 − μ) / σ = (0 − {d.ev_mean.toFixed(2)}) / {d.ev_std.toFixed(2)} = <span className="text-iron-300 font-semibold">{z.toFixed(2)}</span>
                              </div>
                              <div className="text-iron-600 text-[9px] font-sans mt-1">
                                Esto significa que el $0 queda a <span className="text-iron-300">{Math.abs(z).toFixed(2)}σ</span> {z < 0 ? 'a la izquierda' : 'a la derecha'} de la media.
                              </div>

                              <div className="text-iron-600 text-[9px] font-sans font-semibold mt-2">2. Consultamos la tabla Normal:</div>
                              <div className="text-iron-400">
                                Φ({z.toFixed(2)}) = <span className="text-iron-300">{(1 - d.p_positive).toFixed(4)}</span>
                                <span className="text-iron-600"> ← {((1 - d.p_positive) * 100).toFixed(1)}% del área está a la izquierda del 0 (zona de pérdida)</span>
                              </div>

                              <div className="text-iron-600 text-[9px] font-sans font-semibold mt-2">3. Invertimos para obtener el área positiva:</div>
                              <div className="text-iron-400">
                                P(E(X) &gt; 0) = 1 − Φ({z.toFixed(2)}) = 1 − {(1 - d.p_positive).toFixed(4)}
                              </div>
                            </div>
                          );
                        })()}

                        <div className={`font-semibold text-sm border-t border-iron-700 pt-1 mt-1 ${d.p_positive > 0.8 ? "text-risk-green" : d.p_positive > 0.5 ? "text-amber-400" : "text-risk-red"}`}>
                          P(E(X) &gt; 0) = {(d.p_positive * 100).toFixed(1)}%
                        </div>
                        <div className="text-iron-600 text-[9px] font-sans">
                          → Hay un <span className="text-iron-300">{(d.p_positive * 100).toFixed(1)}%</span> de probabilidad de que la estrategia tenga edge positivo.
                        </div>
                      </div>
                      <GaussianChart
                        mean={d.ev_mean} std={d.ev_std}
                        lower={d.ev_lower} upper={d.ev_upper}
                        label="E(X)"
                        hideIcFill
                        shadeAbove={0}
                        shadeAboveColor="#10b981"
                        shadeAboveLabel={`P(E(X)>0) = ${(d.p_positive * 100).toFixed(1)}%`}
                        shadeBelow={0}
                        shadeBelowColor="#ef4444"
                        shadeBelowLabel={`P(E(X)<0) = ${((1 - d.p_positive) * 100).toFixed(1)}%`}
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
              {data?.risk_gauges && Object.keys(data.risk_gauges).length > 0 && (
                <div className="bg-surface-secondary border border-iron-700 rounded-xl p-4">
                  <h3 className="text-xs font-semibold text-iron-300 mb-3">📉 Gauges de Riesgo (info visual)</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {Object.entries(data.risk_gauges).map(([key, gauge]) => {
                      const label = METRICS.find(m => m.key === key)?.label || key;
                      const statusColor = gauge.status === "green" ? "text-risk-green" : gauge.status === "amber" ? "text-amber-400" : "text-risk-red";
                      const statusIcon = gauge.status === "green" ? "✅" : gauge.status === "amber" ? "⚠️" : "🔴";
                      return (
                        <div key={key} className={`bg-surface-tertiary rounded-lg p-3 ${gauge.simulated ? 'border border-amber-500/30' : ''}`}>
                          <div className="text-[10px] text-iron-500 flex items-center gap-1">
                            {label}
                            {gauge.simulated && <span className="text-amber-400 text-[8px]" title="Valor recalculado con trades simulados">🧪 sim</span>}
                          </div>
                          <div className="flex items-baseline gap-2">
                            <span className="text-sm font-bold text-iron-200">
                              {metricFormatter.format(key, gauge.current)}
                            </span>
                            <span className={`text-[10px] font-mono ${statusColor}`}>
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
                            <div className="text-[10px] text-iron-600 mt-1 opacity-70" title="Porcentaje consumido de tu Límite (Pact Limit consumed)">
                              {((gauge.current / gauge.limit) * 100).toFixed(1)}% de tu Límite ({metricFormatter.format(key, gauge.limit)})
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[9px] text-iron-600 mt-2">
                    Percentiles respecto al backtest. No alimentan P(EV&gt;0).
                  </p>
                </div>
              )}
            </>
          ) : data && !d ? (
            <div className="bg-surface-secondary border border-iron-700 rounded-xl p-8 text-center">
              <span className="text-3xl">📊</span>
              <p className="text-iron-400 mt-2">Datos insuficientes para descomposición</p>
              <p className="text-iron-600 text-xs mt-1">Se requieren al menos {minTradesCi} trades</p>
            </div>
          ) : (
            <div className="bg-surface-secondary border border-iron-700 rounded-xl p-8 text-center">
              <span className="text-3xl">🧪</span>
              <p className="text-iron-400 mt-2">Selecciona una estrategia para evaluar</p>
            </div>
          )}
        </div>
      </div>

      {/* Distribution Chart */}
      {selectedId && (
        <div className="bg-surface-secondary border border-iron-700 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-iron-200 mb-3">📈 Distribuciones Interactivas</h3>
          <div className="flex gap-2 mb-4 flex-wrap">
            {METRICS.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setSelectedMetric(key)}
                className={`px-3 py-1 rounded-full text-xs transition-colors ${
                  selectedMetric === key
                    ? "bg-[#00aaff] text-white"
                    : "bg-surface-tertiary text-iron-400 hover:text-iron-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {chartLoading ? (
            <div className="h-64 flex items-center justify-center text-iron-500">Cargando gráfico...</div>
          ) : chartDataState ? (
            <InteractiveDistribution
              chartData={chartDataState}
            />
          ) : (
            <div className="h-64 flex items-center justify-center text-iron-600">Sin datos de distribución</div>
          )}
        </div>
      )}
    </div>
  );
}
