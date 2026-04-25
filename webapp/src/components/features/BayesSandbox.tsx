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
import { resolveBlindRisk, BLIND_RISK_THRESHOLDS } from "@/utils/blindRisk";

// --- Log-Gamma (Lanczos approximation) for Beta PDF ---
import GaussianChart from "@/components/features/charts/GaussianChart";
import BayesMathBreakdown from "@/components/features/shared/BayesMathBreakdown";

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
  confidence: number;
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
  
  const [threshRedBayes, setThreshRedBayes] = useState<number>(100 - BLIND_RISK_THRESHOLDS.CRITICAL_FLOOR);
  const [threshAmberBayes, setThreshAmberBayes] = useState<number>(100 - BLIND_RISK_THRESHOLDS.LOW_CEILING);
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
    ? resolveBlindRisk(d.p_positive).style.textColor
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
              {data?.historical_risk && data.historical_risk.length > 0 && (() => {
                const phase = data?.info_report?.phase || 'active';

                // --- EARLY PHASE: informational badge ---
                if (phase === 'waiting' || phase === 'calibrating') {
                  const isWaiting = phase === 'waiting';
                  return (
                    <div className="bg-iron-900 border border-iron-800 rounded-xl p-4 flex items-center gap-4 shadow-xl">
                      <div className="flex flex-col justify-center items-center p-3 rounded-xl min-w-[120px] border border-blue-500/30 bg-blue-500/10">
                        <div className="text-3xl mb-1 text-blue-400">{isWaiting ? '⏳' : '📡'}</div>
                        <div className="font-mono font-bold tracking-widest text-sm text-blue-400">
                          {isWaiting ? 'ESPERANDO' : 'CALIBRANDO'}
                        </div>
                      </div>
                      <div className="flex-1">
                        <h3 className="text-iron-200 font-bold mb-1 text-sm">Veredicto Maestro de Riesgo</h3>
                        <p className="text-[11px] text-blue-300 leading-relaxed">
                          {isWaiting
                            ? 'Sin datos live. Solo se muestra la proyección del backtest.'
                            : `Calibrando — ${data?.live_trades_total ?? 0} trades live. Los indicadores aún no tienen potencia estadística.`
                          }
                        </p>
                        <p className="text-[10px] text-iron-500 italic mt-1">
                          {isWaiting
                            ? 'Necesitas al menos 10 trades live para activar el semáforo.'
                            : `Faltan ${Math.max(0, 10 - (data?.live_trades_total ?? 0))} trades para el veredicto completo.`
                          }
                        </p>
                      </div>
                    </div>
                  );
                }

                // --- ACTIVE PHASE: full traffic light ---
                const lastRisk = data.historical_risk[data.historical_risk.length - 1];
                return (
                <div className="bg-iron-900 border border-iron-800 rounded-xl p-4 flex items-center gap-4 shadow-xl">
                  {(() => {
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
                );
              })()}

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
                        resolveBlindRisk(d.p_positive).style.barGradient
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

                {/* Collapsible step-by-step breakdown isolated to BayesMathBreakdown component */}
                {d && <BayesMathBreakdown decomposition={d} />}
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
