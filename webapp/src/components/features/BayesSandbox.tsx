"use client";

import React, { useState, useEffect } from "react";
import { strategyAPI } from "@/services/api";
import { useStrategyStore } from "@/store/useStrategyStore";
import InteractiveDistribution from "@/components/features/charts/InteractiveDistribution";

interface BayesData {
  prior: number;
  posterior: number;
  p_evidence: number;
  p_likelihood: number;
  p_null: number;
  likelihoods: Record<string, number>;
  evidence_values: Record<string, number>;
  credibility_interval_95: [number | null, number | null];
  ci_breakdown: {
    n: number; mean: number; std: number; sem: number;
    t_crit: number; df: number; confidence: number;
    lower: number; upper: number;
  } | null;
  ev_includes_zero: boolean | null;
  hwm_recoveries: number;
  fit_types: Record<string, { type: string; name?: string; body?: string; tail?: string; splice_pct?: number }>;
  strategy_id: string;
  total_trades: number;
  bt_ev: number;
  bt_trades: number;
  live_ev: number | null;
  live_trades_total: number;
  live_pre_hwm: number;
  live_post_hwm: number;
  ci_live: {
    n: number; mean: number; std: number; sem: number;
    t_crit: number; df: number; confidence: number;
    lower: number; upper: number;
  } | null;
  disabled_metrics: string[];
}

export default function BayesSandbox() {
  const { strategies } = useStrategyStore();
  const [selectedId, setSelectedId] = useState<string>("");
  const [data, setData] = useState<BayesData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Override controls
  const [overridePrior, setOverridePrior] = useState<number>(0.5);
  const [overrideDd, setOverrideDd] = useState<string>("");
  const [overrideDailyLoss, setOverrideDailyLoss] = useState<string>("");
  const [overrideStagDays, setOverrideStagDays] = useState<string>("");
  const [overrideStagTrades, setOverrideStagTrades] = useState<string>("");
  const [overrideConsec, setOverrideConsec] = useState<string>("");
  const [useHybrid, setUseHybrid] = useState<boolean>(true);
  const [maxPosterior, setMaxPosterior] = useState<number>(0.85);
  const [minTradesCi, setMinTradesCi] = useState<number>(30);
  const [ciConfidence, setCiConfidence] = useState<number>(0.95);

  // Per-metric toggles
  const [enabledMetrics, setEnabledMetrics] = useState<Record<string, boolean>>({
    max_drawdown: true,
    daily_loss: true,
    stagnation_days: true,
    stagnation_trades: true,
    consecutive_losses: true,
  });

  const toggleMetric = (key: string) => {
    setEnabledMetrics(prev => ({ ...prev, [key]: !prev[key] }));
  };

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

  const fetchBayes = async () => {
    if (!selectedId) return;
    setLoading(true);
    setError(null);
    try {
      const params: any = {
        override_prior: overridePrior,
        use_hybrid: useHybrid,
        max_posterior: maxPosterior,
        min_trades_ci: minTradesCi,
        ci_confidence: ciConfidence,
        disabled_metrics: Object.entries(enabledMetrics)
          .filter(([_, v]) => !v)
          .map(([k]) => k)
          .join(','),
      };
      if (overrideDd !== "") params.override_dd = parseFloat(overrideDd);
      if (overrideDailyLoss !== "") params.override_daily_loss = parseFloat(overrideDailyLoss);
      if (overrideStagDays !== "") params.override_stag_days = parseFloat(overrideStagDays);
      if (overrideStagTrades !== "") params.override_stag_trades = parseFloat(overrideStagTrades);
      if (overrideConsec !== "") params.override_consec = parseFloat(overrideConsec);

      const res = await strategyAPI.getBayes(selectedId, params);
      setData(res.data);
    } catch (err: any) {
      setError(err?.response?.data?.detail || "Request failed");
    }
    setLoading(false);
  };

  useEffect(() => {
    if (selectedId) fetchBayes();
  }, [selectedId, useHybrid, enabledMetrics]);

  // Fetch chart data when strategy or metric changes
  const fetchChartData = async () => {
    if (!selectedId || !selectedMetric) return;
    setChartLoading(true);
    try {
      const ddVal = overrideDd !== "" ? parseFloat(overrideDd) : undefined;
      const res = await strategyAPI.getChartData(selectedId, selectedMetric, ddVal);
      setChartDataState(res.data);
    } catch {
      setChartDataState(null);
    }
    setChartLoading(false);
  };

  useEffect(() => {
    if (selectedId) fetchChartData();
  }, [selectedId, selectedMetric]);

  const posteriorColor = data
    ? data.posterior > 0.7 ? "text-risk-green" 
      : data.posterior > 0.4 ? "text-amber-400" 
      : "text-risk-red"
    : "text-iron-400";

  return (
    <div className="space-y-6 p-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="text-2xl">🧠</span>
        <div>
          <h1 className="text-xl font-bold text-iron-100">Bayes Sandbox</h1>
          <p className="text-xs text-iron-500">Motor Bayesiano de Supervivencia del Edge — Panel de Control Master</p>
        </div>
      </div>

      {/* Strategy Selector */}
      <div className="bg-surface-secondary border border-iron-700 rounded-xl p-5 space-y-4">
        <h3 className="text-sm font-semibold text-iron-200">📋 Selección de Estrategia</h3>
        <select
          value={selectedId}
          onChange={(e) => setSelectedId(e.target.value)}
          className="w-full bg-surface-tertiary border border-iron-700 rounded-lg px-3 py-2 text-sm text-iron-100 focus:outline-none focus:ring-1 focus:ring-iron-500"
        >
          <option value="">— Seleccionar estrategia —</option>
          {strategies.map((s) => {
            const hasEVT = s.distribution_fit && Object.values(s.distribution_fit).some((f: any) => f?.is_hybrid);
            const fitCount = s.distribution_fit ? Object.keys(s.distribution_fit).length : 0;
            return (
              <option key={s.id} value={s.id}>
                {hasEVT ? "⚡" : "📊"} {s.name} (#{("magic_number" in s) ? s.magic_number : "—"} · {s.total_trades} trades · {hasEVT ? "EVT" : fitCount > 0 ? "Gauss" : "Sin fit"})
              </option>
            );
          })}
        </select>
      </div>

      {/* Controls Row */}
      <div className="grid grid-cols-2 gap-4">
        {/* Overrides */}
        <div className="bg-surface-secondary border border-iron-700 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-iron-200">🎛️ Controles de Override</h3>
          
          <div className="space-y-3">
            <div>
              <label className="text-xs text-iron-400 block mb-1">Prior P(A) — Reputación del Bot</label>
              <input
                type="range"
                min={0.05}
                max={0.95}
                step={0.05}
                value={overridePrior}
                onChange={(e) => setOverridePrior(parseFloat(e.target.value))}
                className="w-full accent-[#00aaff]"
              />
              <span className="text-xs text-iron-300 font-mono">{overridePrior.toFixed(2)}</span>
            </div>

            {/* Evidence Toggles */}
            <div>
              <label className="text-xs text-iron-400 block mb-2">Variables de Evidencia P(B|A)</label>
              <div className="space-y-1.5">
                {[
                  { key: "max_drawdown", label: "Drawdown" },
                  { key: "daily_loss", label: "Daily Loss" },
                  { key: "stagnation_days", label: "Estancamiento (días)" },
                  { key: "stagnation_trades", label: "Estancamiento (trades)" },
                  { key: "consecutive_losses", label: "Rachas Perdedoras" },
                ].map(({ key, label }) => (
                  <div key={key} className="flex items-center justify-between bg-surface-tertiary rounded px-3 py-1.5">
                    <span className={`text-xs ${enabledMetrics[key] ? 'text-iron-200' : 'text-iron-600 line-through'}`}>{label}</span>
                    <button
                      onClick={() => toggleMetric(key)}
                      className={`w-9 h-5 rounded-full transition-colors relative ${enabledMetrics[key] ? 'bg-[#00aaff]' : 'bg-iron-700'}`}
                    >
                      <div className={`w-4 h-4 bg-white rounded-full absolute top-0.5 transition-transform ${enabledMetrics[key] ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs text-iron-400 block mb-1">Drawdown ficticio ($)</label>
              <input
                type="number"
                value={overrideDd}
                onChange={(e) => setOverrideDd(e.target.value)}
                placeholder="Sin override (usa live)"
                className="w-full bg-surface-tertiary border border-iron-700 rounded px-3 py-1.5 text-sm text-iron-100 focus:outline-none focus:ring-1 focus:ring-iron-500"
              />
            </div>

            <div>
              <label className="text-xs text-iron-400 block mb-1">Daily Loss ficticio ($)</label>
              <input
                type="number"
                value={overrideDailyLoss}
                onChange={(e) => setOverrideDailyLoss(e.target.value)}
                placeholder="Sin override"
                className="w-full bg-surface-tertiary border border-iron-700 rounded px-3 py-1.5 text-sm text-iron-100 focus:outline-none focus:ring-1 focus:ring-iron-500"
              />
            </div>

            <div>
              <label className="text-xs text-iron-400 block mb-1">Estancamiento ficticio (días)</label>
              <input
                type="number"
                value={overrideStagDays}
                onChange={(e) => setOverrideStagDays(e.target.value)}
                placeholder="Sin override"
                className="w-full bg-surface-tertiary border border-iron-700 rounded px-3 py-1.5 text-sm text-iron-100 focus:outline-none focus:ring-1 focus:ring-iron-500"
              />
            </div>

            <div>
              <label className="text-xs text-iron-400 block mb-1">Estancamiento ficticio (trades)</label>
              <input
                type="number"
                value={overrideStagTrades}
                onChange={(e) => setOverrideStagTrades(e.target.value)}
                placeholder="Sin override"
                className="w-full bg-surface-tertiary border border-iron-700 rounded px-3 py-1.5 text-sm text-iron-100 focus:outline-none focus:ring-1 focus:ring-iron-500"
              />
            </div>

            <div>
              <label className="text-xs text-iron-400 block mb-1">Rachas perdedoras ficticias</label>
              <input
                type="number"
                value={overrideConsec}
                onChange={(e) => setOverrideConsec(e.target.value)}
                placeholder="Sin override"
                className="w-full bg-surface-tertiary border border-iron-700 rounded px-3 py-1.5 text-sm text-iron-100 focus:outline-none focus:ring-1 focus:ring-iron-500"
              />
            </div>
          </div>
        </div>

        {/* Toggle + Thresholds */}
        <div className="bg-surface-secondary border border-iron-700 rounded-xl p-5 space-y-4">
          <h3 className="text-sm font-semibold text-iron-200">⚡ Modo de Análisis</h3>
          
          <div className="flex items-center justify-between bg-surface-tertiary rounded-lg px-4 py-3">
            <div>
              <span className="text-sm text-iron-200">Modelo Híbrido (EVT)</span>
              <p className="text-[10px] text-iron-500">Body + Tail Splice (Pareto)</p>
            </div>
            <button
              onClick={() => setUseHybrid(!useHybrid)}
              className={`w-12 h-6 rounded-full transition-colors relative ${useHybrid ? "bg-[#00aaff]" : "bg-iron-700"}`}
            >
              <div className={`w-5 h-5 bg-white rounded-full absolute top-0.5 transition-transform ${useHybrid ? "translate-x-6" : "translate-x-0.5"}`} />
            </button>
          </div>

          <div>
            <label className="text-xs text-iron-400 block mb-1">Techo Posterior Máx: <span className="text-iron-200 font-mono">{(maxPosterior * 100).toFixed(0)}%</span></label>
            <input
              type="range"
              min={0.50}
              max={0.95}
              step={0.05}
              value={maxPosterior}
              onChange={(e) => setMaxPosterior(parseFloat(e.target.value))}
              className="w-full accent-amber-400"
            />
            <div className="flex justify-between text-[9px] text-iron-600 mt-0.5">
              <span>50% (Paranoico)</span>
              <span>95% (Confiado)</span>
            </div>
          </div>

          <div>
            <label className="text-xs text-iron-400 block mb-1">Mín. trades para CI: <span className="text-iron-200 font-mono">{minTradesCi}</span></label>
            <input
              type="range"
              min={5}
              max={100}
              step={5}
              value={minTradesCi}
              onChange={(e) => setMinTradesCi(parseInt(e.target.value))}
              className="w-full accent-amber-400"
            />
            <div className="flex justify-between text-[9px] text-iron-600 mt-0.5">
              <span>5 (Agresivo)</span>
              <span>100 (Conservador)</span>
            </div>
          </div>

          <div>
            <label className="text-xs text-iron-400 block mb-1">Confianza CI (1−α): <span className="text-iron-200 font-mono">{(ciConfidence * 100).toFixed(0)}%</span> <span className="text-iron-600">(α={((1-ciConfidence)*100).toFixed(0)}% → {((1-ciConfidence)/2*100).toFixed(1)}% cada cola)</span></label>
            <input
              type="range"
              min={0.80}
              max={0.99}
              step={0.01}
              value={ciConfidence}
              onChange={(e) => setCiConfidence(parseFloat(e.target.value))}
              className="w-full accent-amber-400"
            />
            <div className="flex justify-between text-[9px] text-iron-600 mt-0.5">
              <span>80% (Relajado)</span>
              <span>99% (Estricto)</span>
            </div>
          </div>

          <button
            onClick={fetchBayes}
            disabled={!selectedId || loading}
            className="w-full bg-[#00aaff] hover:bg-[#0088dd] disabled:bg-iron-700 disabled:text-iron-500 text-white font-semibold py-3 rounded-lg transition-colors"
          >
            {loading ? "⏳ Calculando..." : "🔬 Ejecutar Evaluación Bayesiana"}
          </button>

          {error && (
            <p className="text-risk-red text-xs">{error}</p>
          )}
        </div>
      </div>

      {/* Results */}
      {data && (
        <div className="space-y-4">
          {/* Main Gauge */}
          <div className="bg-surface-secondary border border-iron-700 rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-iron-200">📊 Resultado: P(A|B,C,...)</h3>
              <span className="text-xs text-iron-500">HWM Recoveries: {data.hwm_recoveries}</span>
            </div>

            <div className="flex items-center gap-8">
              {/* Posterior big number */}
              <div className="text-center">
                <div className={`text-5xl font-black font-mono tabular-nums ${posteriorColor}`}>
                  {(data.posterior * 100).toFixed(1)}%
                </div>
                <p className="text-[10px] text-iron-500 mt-1">Probabilidad de Supervivencia</p>
              </div>

              {/* Visual gauge bar */}
              <div className="flex-1 space-y-2">
                <div className="flex justify-between text-[10px] text-iron-500">
                  <span>🪦 Edge Muerto</span>
                  <span>Edge Vivo 💪</span>
                </div>
                <div className="w-full h-4 bg-iron-800 rounded-full overflow-hidden relative">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${
                      data.posterior > 0.7 ? "bg-risk-green" : data.posterior > 0.4 ? "bg-amber-500" : "bg-risk-red"
                    }`}
                    style={{ width: `${data.posterior * 100}%` }}
                  />
                  {/* Prior marker */}
                  <div
                    className="absolute top-0 h-full w-0.5 bg-white/50"
                    style={{ left: `${data.prior * 100}%` }}
                    title={`Prior: ${(data.prior * 100).toFixed(0)}%`}
                  />
                </div>
                <div className="flex justify-between text-[10px] font-mono text-iron-400">
                  <span>P(A)={(data.prior * 100).toFixed(0)}%</span>
                  <span className="text-iron-500 cursor-help" title="P(B|A) = Verosimilitud conjunta = producto de todas las P(Bᵢ|A). Es la probabilidad de observar TODA la evidencia actual si el Edge sigue vivo.">
                    P(B|A)={data.p_likelihood.toFixed(4)} <span className="text-iron-600">ⓘ</span>
                  </span>
                  <span className="text-iron-500 cursor-help" title="P(B) = Probabilidad marginal de la evidencia = P(B|A)·P(A) + P(B|¬A)·P(¬A). Es el denominador de Bayes. Cuanto menor es P(B), más rara es la evidencia y más mueve el posterior.">
                    P(B)={data.p_evidence.toFixed(4)} <span className="text-iron-600">ⓘ</span>
                  </span>
                  <span>P(A|B)={(data.posterior * 100).toFixed(1)}%</span>
                </div>
              </div>
            </div>
          </div>

          {/* Calculation Breakdown */}
          <div className="bg-surface-secondary border border-iron-700 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-iron-200 mb-3">🧮 Desglose del Cálculo — Teorema de Bayes</h3>
            <div className="bg-surface-tertiary rounded-lg p-4 font-mono text-xs space-y-2">
              <div className="text-iron-500 text-[10px] mb-2">P(A|B) = P(B|A) · P(A) / P(B)</div>
              
              <div className="flex justify-between items-center">
                <span className="text-iron-400">P(A) — Prior</span>
                <span className="text-[#00aaff]">{data.prior.toFixed(4)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-iron-400">P(B|A) — Verosimilitud conjunta</span>
                <span className="text-[#00ffaa]">{data.p_likelihood.toFixed(6)}</span>
              </div>
              <div className="text-iron-600 text-[9px] pl-4">
                = {Object.entries(data.likelihoods).map(([m, v]) => `P(${m}|A)=${v.toFixed(4)}`).join(" × ") || "1.0 (sin evidencias)"}
              </div>
              <div className="flex justify-between items-center">
                <span className="text-iron-400">P(B|¬A) — Hipótesis nula</span>
                <span className="text-iron-300">{data.p_null.toFixed(6)}</span>
              </div>
              <div className="text-iron-600 text-[9px] pl-4">
                = 0.5^{Object.keys(data.likelihoods).length} (cada métrica equiprobable si Edge muerto)
              </div>
              
              <div className="border-t border-iron-700 my-2" />
              
              <div className="flex justify-between items-center">
                <span className="text-iron-400">Numerador: P(B|A)·P(A)</span>
                <span className="text-iron-200">{(data.p_likelihood * data.prior).toFixed(6)}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-iron-400">Denominador: P(B) = Num + P(B|¬A)·P(¬A)</span>
                <span className="text-amber-400">{data.p_evidence.toFixed(6)}</span>
              </div>
              <div className="text-iron-600 text-[9px] pl-4">
                = {(data.p_likelihood * data.prior).toFixed(6)} + {data.p_null.toFixed(6)} × {(1 - data.prior).toFixed(4)} = {data.p_evidence.toFixed(6)}
              </div>
              
              <div className="border-t border-iron-700 my-2" />
              
              <div className="flex justify-between items-center text-sm">
                <span className="text-iron-200 font-semibold">P(A|B) = Num / P(B)</span>
                <span className={`font-bold ${data.posterior > 0.5 ? 'text-risk-green' : 'text-risk-red'}`}>
                  {(data.p_likelihood * data.prior / data.p_evidence).toFixed(6)} → cap {(data.posterior * 100).toFixed(1)}%
                </span>
              </div>
            </div>
          </div>

          {/* Likelihoods Table */}
          <div className="bg-surface-secondary border border-iron-700 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-iron-200 mb-3">🔍 Verosimilitudes P(B|A) — Evidencias</h3>
            <div className="space-y-2">
              {Object.entries(data.likelihoods)
                .filter(([metric]) => !data.disabled_metrics?.includes(metric))
                .map(([metric, likelihood]) => {
                const fitType = data.fit_types[metric];
                const evidence = data.evidence_values[metric];
                return (
                  <div key={metric} className="flex items-center justify-between bg-surface-tertiary rounded-lg px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-iron-300 font-medium">{metric}</span>
                      {fitType && (
                        <span className={`text-[9px] px-1.5 py-0.5 rounded ${
                          fitType.type === "hybrid" ? "bg-[#00ffaa]/10 text-[#00ffaa] border border-[#00ffaa]/20" :
                          fitType.type === "simple" ? "bg-[#00aaff]/10 text-[#00aaff] border border-[#00aaff]/20" :
                          "bg-iron-700 text-iron-400"
                        }`}>
                          {fitType.type === "hybrid" ? `⚡ ${fitType.body}+${fitType.tail}` :
                           fitType.type === "simple" ? fitType.name :
                           "empirical"}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-xs font-mono">
                      <span className="text-iron-400">Val: ${evidence?.toFixed(2)}</span>
                      <span className={`font-semibold ${likelihood > 0.3 ? "text-risk-green" : likelihood > 0.1 ? "text-amber-400" : "text-risk-red"}`}>
                        P(B|A)={likelihood.toFixed(4)}
                      </span>
                    </div>
                  </div>
                );
              })}
              {Object.keys(data.likelihoods).filter(m => !data.disabled_metrics?.includes(m)).length === 0 && (
                <p className="text-xs text-iron-500 text-center py-2">Sin evidencias activas — el Posterior = Prior</p>
              )}
            </div>
          </div>

          {/* Credibility Interval */}
          {data.credibility_interval_95[0] === null ? (
            <div className="border border-iron-700 rounded-xl p-5 bg-surface-secondary">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-iron-200">📐 Intervalo de Credibilidad al 95% para EV</h3>
                  <p className="text-xs text-iron-500 mt-0.5">Si el intervalo contiene el 0, el Edge es indistinguible del azar</p>
                </div>
                <div className="text-sm font-bold font-mono text-iron-500">
                  ⏳ INSUFICIENTES DATOS
                </div>
              </div>
              {/* Trade phase counts + EV */}
              <div className="mt-3 grid grid-cols-4 gap-2">
                <div className="bg-surface-tertiary rounded-lg px-3 py-2 text-center cursor-help" title="Trades del backtest histórico (CSV). Base para el análisis estadístico y el Intervalo de Credibilidad.">
                  <div className="text-sm font-bold text-iron-200 font-mono">{data.bt_trades}</div>
                  <div className="text-[9px] text-iron-500">Trades BT</div>
                </div>
                <div className="bg-surface-tertiary rounded-lg px-3 py-2 text-center cursor-help" title="Total de operaciones cerradas en cuenta real (enviadas por el EA vía heartbeat).">
                  <div className="text-sm font-bold text-iron-200 font-mono">{data.live_trades_total}</div>
                  <div className="text-[9px] text-iron-500">Live Total</div>
                </div>
                <div className="bg-surface-tertiary rounded-lg px-3 py-2 text-center cursor-help" title="Fase B: Trades live que NO superaron el High Water Mark. El bot está sufriendo drawdown o estancamiento. Evidencia real para Bayes.">
                  <div className="text-sm font-bold text-amber-400 font-mono">{data.live_pre_hwm}</div>
                  <div className="text-[9px] text-iron-500">Pre-HWM (B)</div>
                </div>
                <div className="bg-surface-tertiary rounded-lg px-3 py-2 text-center cursor-help" title="Fase C: Trades live que establecieron un nuevo máximo (High Water Mark). El bot demostró capacidad de recuperación. Cada ciclo de recuperación sube el Prior.">
                  <div className="text-sm font-bold text-risk-green font-mono">{data.live_post_hwm}</div>
                  <div className="text-[9px] text-iron-500">Post-HWM (C)</div>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <span className="text-[10px] text-iron-500">EV Backtest:</span>
                <span className={`text-xs font-mono font-semibold ${data.bt_ev > 0 ? 'text-risk-green' : 'text-risk-red'}`}>
                  ${data.bt_ev.toFixed(2)}/trade
                </span>
              </div>
              <p className="mt-2 text-xs text-iron-500">
                Se necesitan al menos <strong className="text-iron-300">{minTradesCi} trades</strong> de backtest para calcular un intervalo de credibilidad fiable.
              </p>
            </div>
          ) : (
            <div className={`border rounded-xl p-5 ${
              data.ev_includes_zero 
                ? "bg-risk-red/5 border-risk-red/30" 
                : "bg-risk-green/5 border-risk-green/30"
            }`}>
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-iron-200">📐 Intervalo de Credibilidad al 95% para EV</h3>
                  <p className="text-xs text-iron-500 mt-0.5">Si el intervalo contiene el 0, el Edge es indistinguible del azar</p>
                </div>
                <div className={`text-lg font-bold font-mono ${data.ev_includes_zero ? "text-risk-red" : "text-risk-green"}`}>
                  {data.ev_includes_zero ? "⚠️ CONTIENE CERO" : "✅ EV > 0"}
                </div>
              </div>

              {/* Trade phase counts */}
              <div className="mt-3 grid grid-cols-4 gap-2">
                <div className="bg-surface-tertiary rounded-lg px-3 py-2 text-center cursor-help" title="Trades del backtest histórico (CSV). Base para el análisis estadístico y el Intervalo de Credibilidad.">
                  <div className="text-sm font-bold text-iron-200 font-mono">{data.bt_trades}</div>
                  <div className="text-[9px] text-iron-500">Trades BT</div>
                </div>
                <div className="bg-surface-tertiary rounded-lg px-3 py-2 text-center cursor-help" title="Total de operaciones cerradas en cuenta real (enviadas por el EA vía heartbeat).">
                  <div className="text-sm font-bold text-iron-200 font-mono">{data.live_trades_total}</div>
                  <div className="text-[9px] text-iron-500">Live Total</div>
                </div>
                <div className="bg-surface-tertiary rounded-lg px-3 py-2 text-center cursor-help" title="Fase B: Trades live que NO superaron el High Water Mark. El bot está sufriendo drawdown o estancamiento. Evidencia real para Bayes.">
                  <div className="text-sm font-bold text-amber-400 font-mono">{data.live_pre_hwm}</div>
                  <div className="text-[9px] text-iron-500">Pre-HWM (B)</div>
                </div>
                <div className="bg-surface-tertiary rounded-lg px-3 py-2 text-center cursor-help" title="Fase C: Trades live que establecieron un nuevo máximo (High Water Mark). El bot demostró capacidad de recuperación. Cada ciclo de recuperación sube el Prior.">
                  <div className="text-sm font-bold text-risk-green font-mono">{data.live_post_hwm}</div>
                  <div className="text-[9px] text-iron-500">Post-HWM (C)</div>
                </div>
              </div>

              <div className="mt-3 flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-xs text-iron-400">EV ∈</span>
                  <span className="font-mono text-sm text-iron-200">
                    [{(data.credibility_interval_95[0] as number).toFixed(2)}, {(data.credibility_interval_95[1] as number).toFixed(2)}]
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-[10px] text-iron-500">EV BT:</span>
                  <span className={`text-xs font-mono font-semibold ${data.bt_ev > 0 ? 'text-risk-green' : 'text-risk-red'}`}>
                    ${data.bt_ev.toFixed(2)}/trade
                  </span>
                </div>
              </div>

              {/* Visual interval */}
              <div className="mt-3 relative h-6">
                {(() => {
                  const lo = data.credibility_interval_95[0] as number;
                  const hi = data.credibility_interval_95[1] as number;
                  const absMax = Math.max(Math.abs(lo), Math.abs(hi), 1);
                  const range = absMax * 2;
                  const loPos = ((lo + absMax) / range) * 100;
                  const hiPos = ((hi + absMax) / range) * 100;
                  const zeroPos = (absMax / range) * 100;

                  return (
                    <>
                      <div className="absolute inset-0 bg-iron-800 rounded-full" />
                      <div
                        className={`absolute top-0 h-full rounded-full ${data.ev_includes_zero ? "bg-risk-red/30" : "bg-risk-green/30"}`}
                        style={{ left: `${loPos}%`, width: `${hiPos - loPos}%` }}
                      />
                      <div
                        className="absolute top-0 h-full w-0.5 bg-white/60"
                        style={{ left: `${zeroPos}%` }}
                      />
                      <span className="absolute -bottom-4 text-[8px] text-iron-500" style={{ left: `${zeroPos}%`, transform: "translateX(-50%)" }}>
                        EV=0
                      </span>
                    </>
                  );
                })()}
              </div>
            </div>
          )}

          {/* CI LIVE — The one that ACTUALLY matters */}
          <div className={`border rounded-xl p-5 ${
            data.ci_live 
              ? (data.ci_live.lower > 0 ? "bg-risk-green/5 border-risk-green/30" : "bg-risk-red/5 border-risk-red/30")
              : "bg-amber-500/5 border-amber-500/30"
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-iron-200">🔴 CI LIVE — Intervalo en Cuenta Real</h3>
                <p className="text-xs text-iron-500 mt-0.5">
                  {data.ci_live 
                    ? "¿El edge se mantiene en real? SI el 0 está dentro, NO puedes demostrar edge en vivo."
                    : `Necesitas ≥${minTradesCi} trades live para calcular (tienes ${data.live_trades_total})`
                  }
                </p>
              </div>
              {data.ci_live && (
                <div className={`text-lg font-bold font-mono ${data.ci_live.lower > 0 ? "text-risk-green" : "text-risk-red"}`}>
                  {data.ci_live.lower > 0 ? "✅ EV > 0 en LIVE" : "⚠️ CONTIENE CERO"}
                </div>
              )}
            </div>

            {data.ci_live ? (
              <div className="mt-3 space-y-2">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-iron-400">EV Live ∈</span>
                    <span className="font-mono text-sm text-iron-200">
                      [{data.ci_live.lower.toFixed(2)}, {data.ci_live.upper.toFixed(2)}]
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-iron-400">x̄ Live</span>
                    <span className={`font-mono text-sm font-semibold ${(data.live_ev ?? 0) > 0 ? 'text-risk-green' : 'text-risk-red'}`}>
                      ${(data.live_ev ?? 0).toFixed(2)}/trade
                    </span>
                  </div>
                  <span className="text-[10px] text-iron-600">n={data.ci_live.n} · df={data.ci_live.df} · t={data.ci_live.t_crit.toFixed(3)}</span>
                </div>
                {/* Visual bar */}
                <div className="relative h-6">
                  {(() => {
                    const lo = data.ci_live.lower;
                    const hi = data.ci_live.upper;
                    const absMax = Math.max(Math.abs(lo), Math.abs(hi), 1);
                    const range = absMax * 2;
                    const loPos = ((lo + absMax) / range) * 100;
                    const hiPos = ((hi + absMax) / range) * 100;
                    const zeroPos = (absMax / range) * 100;
                    return (
                      <>
                        <div className="absolute inset-0 bg-iron-800 rounded-full" />
                        <div
                          className={`absolute top-0 h-full rounded-full ${data.ci_live.lower > 0 ? "bg-risk-green/40" : "bg-risk-red/40"}`}
                          style={{ left: `${loPos}%`, width: `${hiPos - loPos}%` }}
                        />
                        <div className="absolute top-0 h-full w-0.5 bg-white/60" style={{ left: `${zeroPos}%` }} />
                        <span className="absolute -bottom-4 text-[8px] text-iron-500" style={{ left: `${zeroPos}%`, transform: "translateX(-50%)" }}>EV=0</span>
                      </>
                    );
                  })()}
                </div>
              </div>
            ) : (
              <div className="mt-3 flex items-center gap-3">
                <div className="w-full bg-iron-800 rounded-full h-2">
                  <div 
                    className="bg-amber-500/50 h-2 rounded-full transition-all" 
                    style={{ width: `${Math.min((data.live_trades_total / minTradesCi) * 100, 100)}%` }} 
                  />
                </div>
                <span className="text-xs text-iron-400 whitespace-nowrap font-mono">
                  {data.live_trades_total}/{minTradesCi}
                </span>
              </div>
            )}
          </div>

          {/* CI Calculation Breakdown */}
          {data.ci_breakdown && (
            <div className="bg-surface-secondary border border-iron-700 rounded-xl p-5">
              <h3 className="text-sm font-semibold text-iron-200 mb-3">🧮 Desglose CI — Intervalo de Credibilidad</h3>
              <div className="bg-surface-tertiary rounded-lg p-4 font-mono text-xs space-y-2">
                <div className="text-iron-500 text-[10px] mb-2">CI = x̄ ± t(α/2, df) × SEM</div>
                
                <div className="flex justify-between items-center">
                  <span className="text-iron-400">n — Número de trades (BT)</span>
                  <span className="text-[#00aaff]">{data.ci_breakdown.n}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-iron-400">x̄ — Media (EV por trade)</span>
                  <span className="text-[#00ffaa]">${data.ci_breakdown.mean.toFixed(4)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-iron-400">σ — Desviación típica</span>
                  <span className="text-iron-200">${data.ci_breakdown.std.toFixed(4)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-iron-400">SEM — Error estándar = σ/√n</span>
                  <span className="text-iron-200">{data.ci_breakdown.sem.toFixed(4)}</span>
                </div>
                <div className="text-iron-600 text-[9px] pl-4">
                  = {data.ci_breakdown.std.toFixed(4)} / √{data.ci_breakdown.n} = {data.ci_breakdown.sem.toFixed(4)}
                </div>
                
                <div className="border-t border-iron-700 my-2" />
                
                <div className="flex justify-between items-center">
                  <span className="text-iron-400">df — Grados de libertad</span>
                  <span className="text-iron-300">{data.ci_breakdown.df}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-iron-400">α — Nivel de significancia</span>
                  <span className="text-iron-300">{((1 - data.ci_breakdown.confidence) * 100).toFixed(0)}%</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-iron-400">t(α/2, df) — Valor crítico t-Student</span>
                  <span className="text-amber-400">{data.ci_breakdown.t_crit.toFixed(4)}</span>
                </div>
                
                <div className="border-t border-iron-700 my-2" />
                
                <div className="flex justify-between items-center">
                  <span className="text-iron-400">Margen de error = t × SEM</span>
                  <span className="text-iron-200">{(data.ci_breakdown.t_crit * data.ci_breakdown.sem).toFixed(4)}</span>
                </div>
                
                <div className="border-t border-iron-700 my-2" />
                
                <div className="flex justify-between items-center text-sm">
                  <span className="text-iron-200 font-semibold">CI al {(data.ci_breakdown.confidence * 100).toFixed(0)}%</span>
                  <span className={`font-bold ${data.ev_includes_zero ? 'text-risk-red' : 'text-risk-green'}`}>
                    [{data.ci_breakdown.lower.toFixed(4)}, {data.ci_breakdown.upper.toFixed(4)}]
                  </span>
                </div>
                <div className="text-iron-600 text-[9px] pl-4">
                  = {data.ci_breakdown.mean.toFixed(4)} ± {data.ci_breakdown.t_crit.toFixed(4)} × {data.ci_breakdown.sem.toFixed(4)}
                </div>
              </div>
            </div>
          )}

          {/* Interactive Distribution Chart (Superman A/B) */}
          <div className="bg-surface-secondary border border-iron-700 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-iron-200">📈 Distribución Interactiva (Superman)</h3>
              <div className="flex gap-1">
                {METRICS.map((m) => (
                  <button
                    key={m.key}
                    onClick={() => setSelectedMetric(m.key)}
                    className={`text-[9px] px-2 py-1 rounded-md transition-colors ${
                      selectedMetric === m.key
                        ? "bg-[#00aaff]/20 text-[#00aaff] border border-[#00aaff]/30"
                        : "bg-surface-tertiary text-iron-500 hover:text-iron-300 border border-iron-700"
                    }`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="h-[300px]">
              <InteractiveDistribution chartData={chartDataState} loading={chartLoading} />
            </div>
          </div>

          {/* Fit Types Summary */}
          <div className="bg-surface-secondary border border-iron-700 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-iron-200 mb-3">🧬 Resumen de Modelos por Métrica</h3>
            <div className="grid grid-cols-2 gap-2">
              {Object.entries(data.fit_types).map(([metric, info]) => (
                <div key={metric} className="bg-surface-tertiary rounded-lg px-3 py-2 flex items-center justify-between">
                  <span className="text-xs text-iron-300">{metric}</span>
                  <span className={`text-[9px] font-mono ${
                    info.type === "hybrid" ? "text-[#00ffaa]" :
                    info.type === "simple" ? "text-[#00aaff]" :
                    "text-iron-500"
                  }`}>
                    {info.type === "hybrid" ? `⚡ ${info.body}+${info.tail}` :
                     info.type === "simple" ? info.name :
                     "Empírica"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
