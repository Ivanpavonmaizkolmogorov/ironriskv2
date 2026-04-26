"use client";

import React, { useState, useEffect, useMemo } from "react";
import { ResponsiveContainer, AreaChart, Area, YAxis, ReferenceLine, Tooltip } from "recharts";
import type { EquityPoint } from "@/types/strategy";
import { strategyAPI, portfolioAPI } from "@/services/api";
import { DashboardContext } from "../dashboardViewConfigs";
import EquityCurve from "@/components/features/charts/EquityCurve";
import InfoPopover from "@/components/ui/InfoPopover";
import MetricTooltip from "@/components/ui/MetricTooltip";
import { useTranslations } from "next-intl";
import { getVerdictStyle, type VerdictStatus } from "@/utils/VerdictConfig";
import { metricFormatter } from "@/utils/MetricFormatter";
import { Humanizer, type RiskGaugeData } from "@/utils/Humanizer";
import { resolveBlindRisk } from "@/utils/blindRisk";

// ─── Types ───────────────────────────────────────────────────────────────────

interface EVDecomposition {
  p_positive: number;
  blind_risk: number;
  ev_mean: number;
}

interface RiskGauge {
  current: number;
  percentile: number;
  status: "green" | "amber" | "red" | "fatal";
  simulated?: boolean;
  limit?: number;
}

interface BayesData {
  strategy_id: string;
  live_trades_total: number;
  bt_trades: number;
  decomposition: EVDecomposition | null;
  risk_gauges: Record<string, RiskGauge>;
  info_report?: { phase: string; signals: any[] };
}

// ─── Gauge card (horizontal bottom row) ──────────────────────────────────────

function GaugeCard({ metricKey, gauge, humanizer, label }: {
  metricKey: string;
  gauge: RiskGauge;
  humanizer: Humanizer;
  label: string;
}) {
  const phrase = humanizer.gaugeNarrative(metricKey, gauge as RiskGaugeData);
  const isRed   = gauge.status === "red" || gauge.status === "fatal";
  const isAmber = gauge.status === "amber";
  const color   = isRed ? "text-red-400"    : isAmber ? "text-amber-400"  : "text-emerald-400";
  const bar     = isRed ? "bg-red-500"      : isAmber ? "bg-amber-500"    : "bg-emerald-500";
  const border  = isRed ? "border-red-500/25" : isAmber ? "border-amber-500/20" : "border-iron-800/40";
  const icon    = isRed ? "🔴"             : isAmber ? "⚠️"               : "✅";

  return (
    <div className={`bg-surface-tertiary rounded-xl p-3 border ${border} flex flex-col gap-1.5 min-w-0`}>
      <div className="text-[10px] text-iron-400 font-semibold uppercase tracking-wider">
        <MetricTooltip metricKey={`live_${metricKey}`} variant="card">{label}</MetricTooltip>
      </div>
      <div className="flex items-baseline justify-between gap-1">
        <span className="font-mono text-sm font-bold text-iron-100">
          {metricFormatter.format(metricKey, gauge.current)}
        </span>
        {gauge.simulated && <span className="text-amber-400 text-[9px]">🧪 sim</span>}
      </div>
      <p className={`text-[10px] leading-snug ${color}`}>{phrase}</p>
      <div className="flex items-center gap-1.5 mt-auto">
        <div className="flex-1 bg-iron-800 rounded-full h-1.5 overflow-hidden">
          <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.min(gauge.percentile, 100)}%` }} />
        </div>
        <span className={`font-mono text-[9px] shrink-0 ${color}`}>{icon} P{gauge.percentile.toFixed(0)}</span>
      </div>
      {gauge.limit && gauge.limit > 0 && (
        <div className="text-[9px] text-iron-600 font-mono">
          {((gauge.current / gauge.limit) * 100).toFixed(1)}% de tu límite ({metricFormatter.format(metricKey, gauge.limit)})
        </div>
      )}
    </div>
  );
}

// ─── Drawdown underwater chart ────────────────────────────────────────────────

function DrawdownMini({ curve, syncId }: { curve: EquityPoint[]; syncId?: string }) {
  const ddData = useMemo(() => {
    let peak = -Infinity;
    return curve.map((pt) => {
      if (pt.equity > peak) peak = pt.equity;
      return {
        date: pt.date ?? String(pt.trade ?? ""),
        dd: peak > -Infinity ? pt.equity - peak : 0,
      };
    });
  }, [curve]);

  const minDD = Math.min(...ddData.map(d => d.dd), 0);
  if (minDD === 0) return null; // never in drawdown — nothing to show

  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null;
    const { dd, date } = payload[0].payload;
    return (
      <div style={{ background: "#1e2228", border: "1px solid #3e444f", borderRadius: 8, padding: "8px 10px", fontSize: 11, color: "#e1e4e8", whiteSpace: "nowrap" }}>
        <div style={{ color: "#78828f", marginBottom: 4 }}>{date}</div>
        <div style={{ color: dd < 0 ? "#ff5252" : "#00e676", fontWeight: 600 }}>
          DD: {dd <= 0 ? metricFormatter.format("max_drawdown", dd) : "$0.00"}
        </div>
      </div>
    );
  };

  return (
    <div className="mt-1">
      <div className="flex items-center gap-1.5 mb-1">
        <span className="text-[9px] text-iron-500 font-semibold uppercase tracking-wider">📉 Drawdown live</span>
        <span className="font-mono text-[9px] text-red-400 font-bold">{metricFormatter.format("max_drawdown", minDD)}</span>
        <span className="text-[9px] text-iron-600">máx</span>
      </div>
      <div style={{ height: 70 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={ddData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} syncId={syncId}>
            <defs>
              <linearGradient id="ddGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.5} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <YAxis
              domain={[minDD * 1.1, 0]}
              tick={{ fill: "#555", fontSize: 9 }}
              axisLine={false} tickLine={false}
              tickFormatter={(v: number) => metricFormatter.format("max_drawdown", v)}
              width={60}
            />
            <ReferenceLine y={0} stroke="#555" strokeDasharray="3 2" strokeWidth={1} />
            <Tooltip content={<CustomTooltip />} offset={20} />
            <Area
              type="monotone" dataKey="dd"
              stroke="#ef4444" strokeWidth={1.5}
              fill="url(#ddGradient)"
              dot={false} activeDot={{ r: 3, fill: "#ef4444" }}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export const MonitorView = ({ context }: { context: DashboardContext }) => {
  const { activeAsset, liveEquity, liveEquityVersion, onNavigateToView } = context;
  const tWorkspace = useTranslations("workspaceManager");
  const tV         = useTranslations("verdict");
  const tH         = useTranslations("humanizer");
  const tMath      = useTranslations("bayesMath");

  const selectedId  = activeAsset?.id ?? "";
  const isPortfolio = activeAsset ? "strategy_ids" in activeAsset : false;

  const [data, setData]       = useState<BayesData | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!selectedId) return;
    setLoading(true);
    setData(null);
    const req = isPortfolio
      ? portfolioAPI.getBayes(selectedId, {})
      : strategyAPI.getBayes(selectedId, {});
    req.then(r => setData(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, [selectedId, liveEquityVersion]);

  const humanizer = new Humanizer(tH, tV);
  const d = data?.decomposition;

  // ── Verdict computation (seeded from info_report signals, then augmented by gauges)
  let hasFatal = false;
  let hasRed = data?.info_report?.signals?.some((s: any) => s.severity === 'warning') || false;
  let hasAmber = data?.info_report?.signals?.some((s: any) => s.severity === 'notable') || false;
  const gaugeEntries: Array<{ key: string; gauge: RiskGauge }> = [];
  if (data?.risk_gauges) {
    Object.entries(data.risk_gauges).forEach(([key, g]: [string, any]) => {
      gaugeEntries.push({ key, gauge: g });
      if      (g.status === "fatal") hasFatal = true;
      else if (g.status === "red")   hasRed   = true;
      else if (g.status === "amber") hasAmber = true;
    });
  }

  const phase         = data?.info_report?.phase ?? "active";
  const verdictStatus = (hasFatal ? "fatal" : hasRed ? "red" : hasAmber ? "amber" : "green") as VerdictStatus;
  const v             = getVerdictStyle(verdictStatus);

  const humanSignals = data?.risk_gauges
    ? humanizer.whatIsHappening(data.risk_gauges as Record<string, RiskGaugeData>)
    : [];

  // ── Blind risk
  const { pct: blindPct, style: blindStyle } = d
    ? resolveBlindRisk(d.p_positive)
    : { pct: 0, style: { textColor: "text-iron-400", barGradient: "bg-iron-700", bgAccent: "", borderAccent: "" } };

  if (!activeAsset) {
    return (
      <div className="flex items-center justify-center h-48 text-iron-500 text-sm bg-surface-secondary/50 rounded-xl border border-iron-800/50">
        {tWorkspace("selectAsset")}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 min-w-0 w-full">

      {/* ── ROW 1: Veredicto (left) + Live Equity (right) ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">

        {/* LEFT — Veredicto Maestro + Riesgo Ciego */}
        <div className={`bg-iron-900 border rounded-xl p-4 flex flex-col gap-3 shadow-xl ${d && phase === "active" ? v.bgColor.replace("bg-", "border-").replace("/10", "/30").replace("/20", "/60") : "border-iron-800"}`}>

          {d && phase === "active" ? (
            <>
              {/* Badge + title row */}
              <div className="flex items-center gap-3">
                <div className={`flex flex-col items-center justify-center p-3 rounded-xl min-w-[90px] border ${v.bgColor}`}>
                  <div className={`text-3xl mb-0.5 ${v.iconClass}`}>{v.icon}</div>
                  <div className={`font-mono font-bold tracking-widest text-xs ${v.labelClass}`}>
                    {tV(v.labelKey as any)}
                  </div>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-iron-200 font-bold text-sm">{tV("masterTitle")}</h3>
                    <InfoPopover
                      content={
                        <div className="space-y-3 p-1">
                          {(["green", "amber", "red", "fatal"] as VerdictStatus[]).reverse().map((sk) => {
                            const s = getVerdictStyle(sk);
                            return (
                              <div key={sk} className="flex gap-2 text-[11px] items-start">
                                <span className={`text-sm mt-0.5 ${s.iconClass}`}>{s.icon}</span>
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
                  <p className={`text-xs font-medium leading-snug ${v.textColor}`}>
                    {humanizer.verdictHeadline(verdictStatus)}
                  </p>
                </div>
              </div>

              {/* Signals */}
              {humanSignals.length > 0 && (
                <div className="space-y-1">
                  <div className="text-[9px] text-iron-500 font-semibold uppercase tracking-wider">⚠️ {tV("whatIsHappening")}</div>
                  {humanSignals.map((sig, i) => {
                    const sigV = getVerdictStyle(sig.status as VerdictStatus);
                    return (
                      <div key={i} className="flex items-start gap-1.5 text-[11px] text-iron-300">
                        <span className={`shrink-0 mt-0.5 ${sigV.iconClass}`}>{sigV.icon}</span>
                        <span>{sig.narrative}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Guidance */}
              <p className="text-[10px] text-iron-500 italic leading-relaxed">
                {humanizer.verdictGuidance(verdictStatus)}
              </p>

              {/* Divider */}
              <div className="border-t border-iron-800" />

              {/* Blind Risk — compact below */}
              <div>
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="text-[10px] text-iron-400 font-semibold">{tMath("ui.blindRiskLabel")}</span>
                  <span className={`text-2xl font-black font-mono ${blindStyle.textColor}`}>
                    {blindPct.toFixed(1)}%
                  </span>
                </div>
                <div className="w-full bg-iron-800 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-500 ${blindStyle.barGradient}`}
                    style={{ width: `${Math.min(blindPct, 100)}%` }}
                  />
                </div>
                <div className="flex items-center justify-between mt-1">
                  <span className="text-[9px] text-iron-600">{tMath("ui.blindRiskLow")}</span>
                  <span className={`text-[10px] font-mono font-semibold ${blindStyle.textColor}`}>
                    P(ventaja) {(d.p_positive * 100).toFixed(1)}%
                  </span>
                  <span className="text-[9px] text-iron-600">{tMath("ui.blindRiskHigh")}</span>
                </div>
              </div>

              {/* Ulysses breach */}
              {hasFatal && (
                <div className="p-2 bg-red-500/5 border-l-2 border-red-500 rounded-r-lg">
                  <p className="text-xs font-bold text-red-500 flex items-center gap-1">⚠️ {tV("ulyssesBreachTitle")}</p>
                  <p className="text-[10px] text-red-400/80 mt-0.5">{tV("ulyssesBreachDesc")}</p>
                </div>
              )}

              {/* CTA → Motor Bayesiano */}
              {onNavigateToView && (
                <button
                  onClick={() => onNavigateToView("ml-bayes")}
                  className="mt-auto w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-iron-800 hover:bg-iron-700 border border-iron-700 hover:border-cyan-500/40 text-iron-300 hover:text-cyan-300 text-xs font-semibold transition-all group"
                >
                  <span>🧠</span>
                  <span>{tWorkspace("viewFullAnalysis")}</span>
                  <span className="ml-auto opacity-50 group-hover:opacity-100 transition-opacity">→</span>
                </button>
              )}
            </>
          ) : data && phase !== "active" ? (
            /* Waiting / calibrating */
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-center justify-center p-3 rounded-xl border border-blue-500/30 bg-blue-500/10 min-w-[90px]">
                <span className="text-3xl mb-0.5">{phase === "waiting" ? "⏳" : "📡"}</span>
                <span className="font-mono font-bold text-xs text-blue-400">
                  {phase === "waiting" ? tWorkspace("phaseWaiting") : tWorkspace("phaseCalibrating")}
                </span>
              </div>
              <p className="text-xs text-blue-300">
                {phase === "waiting"
                  ? tWorkspace("phaseWaitingDesc")
                  : tWorkspace("phaseCalibratingDesc", { n: data.live_trades_total })}
              </p>
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center h-32 text-iron-500 text-xs animate-pulse">{tWorkspace("calculating")}</div>
          ) : (
            <div className="flex items-center justify-center h-32 text-iron-600 text-xs">{tWorkspace("selectStrategy")}</div>
          )}
        </div>

        {/* RIGHT — Live Equity */}
        <div className="bg-surface-secondary border border-iron-700 rounded-xl p-3 flex flex-col gap-1.5">
          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs font-semibold text-cyan-400">{tMath("charts.liveTitle")}</span>
            <div className="ml-auto flex items-center gap-2">
              {liveEquity && liveEquity.trades > 0 && (
                <>
                  <span className={`text-xs font-mono font-bold ${liveEquity.pnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                    {metricFormatter.format("net_profit", liveEquity.pnl)}
                  </span>
                  <span className="text-[10px] text-iron-500 font-mono">
                    {liveEquity.trades} trades
                  </span>
                </>
              )}
            </div>
          </div>

          <div className="flex-1 relative min-h-[130px]">
            {liveEquity && liveEquity.trades > 0 && liveEquity.curve?.length > 0 ? (
              <div className="absolute inset-0">
                <EquityCurve data={liveEquity.curve} variant="live" syncId="monitor-live" yAxisWidth={60} />
              </div>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-surface-tertiary rounded-lg border border-iron-800 border-dashed">
                <span className="text-[10px] text-iron-600">{tMath("charts.waitingLiveTrades")}</span>
              </div>
            )}
          </div>

          {/* Drawdown underwater chart */}
          {liveEquity && liveEquity.curve?.length > 1 && (
            <div className="border-t border-iron-800/60 pt-2">
              <DrawdownMini curve={liveEquity.curve} syncId="monitor-live" />
            </div>
          )}
        </div>
      </div>

      {/* ── ROW 2: Gauges — horizontal, all 5 in a row ── */}
      {d && data?.risk_gauges && Object.keys(data.risk_gauges).length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
          {gaugeEntries.map(({ key, gauge }) => (
            <GaugeCard
              key={key}
              metricKey={key}
              gauge={gauge}
              humanizer={humanizer}
              label={tWorkspace(`gaugeNames.${key}` as any) || key}
            />
          ))}
        </div>
      )}

    </div>
  );
};
