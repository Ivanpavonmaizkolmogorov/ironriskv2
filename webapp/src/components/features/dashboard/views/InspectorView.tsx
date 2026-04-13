import React from "react";
import Card from "@/components/ui/Card";
import EquityCurve from "@/components/features/charts/EquityCurve";
import InteractiveDistribution from "@/components/features/charts/InteractiveDistribution";
import MetricTooltip from "@/components/ui/MetricTooltip";
import AlertsDrawer from "@/components/features/AlertsDrawer";
import { metricFormatter } from "@/utils/MetricFormatter";
import { strategyAPI, portfolioAPI } from "@/services/api";
import { DashboardContext } from "../dashboardViewConfigs";
import { useTranslations } from "next-intl";
import { useStrategyStore } from "@/store/useStrategyStore";
import { usePortfolioStore } from "@/store/usePortfolioStore";

export const InspectorView: React.FC<{ context: DashboardContext }> = ({ context }) => {
  const tMetrics = useTranslations("metrics");
  const [isAlertsOpen, setIsAlertsOpen] = React.useState(false);
  const storeStrategies = useStrategyStore(s => s.strategies);
  const storePortfolios = usePortfolioStore(s => s.portfolios);
  const {
    activeAsset,
    liveEquity,
    chartLoading,
    chartUrl,
    chartData,
    activeChartMetric,
    openChart,
    setLiveEquityVersion,
    accountId,
    fetchStrategies,
    tWorkspace,
    isLightMode,
    isInteractiveMode,
    setIsInteractiveMode
  } = context;

  if (!activeAsset) {
    return (
      <div className="flex items-center justify-center h-64 text-iron-500 font-mono text-sm bg-surface-secondary/50 rounded-xl border border-iron-800/50">
        {tWorkspace("selectAsset")}
      </div>
    );
  }

  return (
    <div className="grid lg:grid-cols-2 gap-4 items-start">
      {/* ═══ LEFT COLUMN: Equity Curves (Backtest + Live) ═══ */}
      <div className="flex flex-col gap-4">
        {/* CARD 1: Backtest Equity Curve */}
        <Card>
          <div className="flex items-center justify-between mb-3 gap-4">
            <h3 className="text-base font-semibold text-iron-100 flex items-center gap-2 flex-1 min-w-0">
              <span className="shrink-0">📈</span>
              <span className="truncate" title={activeAsset.name}>
                {"strategy_ids" in activeAsset ? tWorkspace("cardPortfolioBacktest") : tWorkspace("cardBacktest")} — {activeAsset.name}
              </span>
              {(activeAsset as any).risk_multiplier && (activeAsset as any).risk_multiplier !== 1 && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 font-mono border border-amber-500/30 shrink-0" title="Factor de Escalado">
                  ×{(activeAsset as any).risk_multiplier}
                </span>
              )}
            </h3>
            <span className="text-xs font-mono text-iron-500 shrink-0 text-right">
              {activeAsset.total_trades} {tWorkspace("tradesCount")}
            </span>
          </div>

          <EquityCurve data={activeAsset.equity_curve || []} />
        </Card>

        {/* CARD 2: Live Equity Curve */}
        <Card>
          <div className="flex items-center justify-between mb-3 gap-4">
            <h3 className="text-base font-semibold text-iron-100 flex items-center gap-2 shrink-0">
              <span className="shrink-0">📈</span>
              <span className="text-cyan-400 shrink-0">{tWorkspace("liveBadge")}</span>
              {/* Show open trades animated badge if > 0 */}
              {(activeAsset.risk_config as any)?.open_trades?.current > 0 && (
                <span className="ml-2 px-2 py-0.5 rounded border border-amber-500/30 bg-amber-500/10 text-amber-400 text-[10px] font-mono flex items-center gap-1.5 shrink-0" title="Floating Trades Activos">
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                  {(activeAsset.risk_config as any).open_trades.current} OPEN
                </span>
              )}
            </h3>
            {liveEquity && liveEquity.trades > 0 && (
              <div className="flex items-center gap-3 shrink-0">
                <span className={`text-xs font-mono font-semibold ${liveEquity.pnl >= 0 ? 'text-risk-green' : 'text-risk-red'}`}>
                  {metricFormatter.format("net_profit", liveEquity.pnl)}
                </span>
                <span className="text-xs font-mono text-iron-500">
                  {liveEquity.trades} {tWorkspace("tradesCount")}
                </span>
              </div>
            )}
          </div>

          {(() => {
            const isPortfolio = "strategy_ids" in activeAsset;
            const ec = (activeAsset as any).equity_curve || [];

            // First trade date: use it as reference for min (1 day before)
            let firstTradeDate: string | null = null;
            if (ec.length > 0) {
              firstTradeDate = ec[0]?.date || null;
            }

            // Format converters: MT5 "YYYY.MM.DD HH:MM:SS" ↔ HTML "YYYY-MM-DDTHH:MM:SS"
            const toHtml = (mt5: string) => mt5?.replace(/\./g, '-').replace(' ', 'T').slice(0, 19) || '';
            const toMt5 = (html: string) => html?.replace(/-/g, '.').replace('T', ' ') || '';

            // Min date: 1 day before first trade
            let minDate: Date | undefined;
            if (firstTradeDate) {
              minDate = new Date(toHtml(firstTradeDate));
              minDate.setDate(minDate.getDate() - 1);
            }
            const htmlMin = minDate ? minDate.toISOString().slice(0, 19) : undefined;

            const currentSd = (activeAsset as any).start_date || '';
            const htmlValue = toHtml(currentSd);

            const applyDate = async (mt5Date: string) => {
              if (!mt5Date || mt5Date === currentSd) return;
              try {
                if (isPortfolio) {
                  await portfolioAPI.update(activeAsset.id, { start_date: mt5Date });
                } else {
                  await strategyAPI.update(activeAsset.id, { start_date: mt5Date });
                }
                fetchStrategies(accountId);
                setLiveEquityVersion(v => v + 1);
              } catch { /* silent */ }
            };

            return (
              <div className="flex items-center gap-1.5 mb-2 -mt-1 flex-wrap">
                <span className="text-[10px] text-iron-600 font-medium tracking-wider group/sd relative flex items-center gap-1">
                  📅 {tWorkspace("liveSince")}
                  {isPortfolio && !currentSd && <span className="text-iron-500 font-normal italic ml-1">(Heredado)</span>}
                  <span className="text-iron-600 cursor-help">ⓘ</span>
                  <div className="opacity-0 group-hover/sd:opacity-100 absolute left-0 bottom-full mb-1.5 pointer-events-none transition-opacity duration-150
                    text-[10px] bg-iron-800 text-iron-200 border border-iron-700 px-2.5 py-1.5 rounded-lg shadow-xl w-[220px] normal-case tracking-normal z-50 leading-relaxed">
                    {tWorkspace("tooltipStartDate")}
                  </div>
                </span>
                <input
                  type="datetime-local"
                  defaultValue={htmlValue}
                  key={activeAsset.id + "-sd-" + currentSd}
                  min={htmlMin}
                  step="1"
                  className={`bg-iron-900/60 border border-iron-700 hover:border-iron-600 focus:border-cyan-600/50 text-xs font-mono text-iron-300 px-2 py-1 rounded-md
                    cursor-pointer outline-none transition-colors ${!currentSd && isPortfolio ? 'hidden' : ''}`}
                  style={{ colorScheme: 'dark' }}
                  title={tWorkspace("tooltipStartDate")}
                  onChange={async (e) => {
                    const htmlVal = e.target.value;
                    if (htmlVal) {
                      const mt5Val = toMt5(htmlVal);
                      await applyDate(mt5Val);
                    }
                  }}
                />
                {htmlMin && (
                  <button
                    onClick={() => applyDate(toMt5(htmlMin))}
                    className="px-1.5 py-0.5 text-[9px] font-mono rounded bg-iron-800/60 text-iron-500
                      hover:bg-iron-700 hover:text-cyan-400 transition-colors border border-iron-700/50"
                    title={tWorkspace("resetDefault")}
                  >↺</button>
                )}
              </div>
            );
          })()}
          {liveEquity ? (
            <>
              {liveEquity.totalAll > liveEquity.trades && (
                <p className="text-[10px] text-amber-500/80 mb-2 font-mono">
                  {tWorkspace("warningExcluded", { count: liveEquity.totalAll - liveEquity.trades })}
                </p>
              )}
              {liveEquity.trades > 0 ? (
                <EquityCurve data={liveEquity.curve} variant="live" />
              ) : (
                <div className="flex items-center justify-center h-32 text-iron-600 text-xs">
                  {liveEquity.totalAll > 0
                    ? tWorkspace("warningNoTradesAdjust", { count: liveEquity.totalAll })
                    : tWorkspace("waitingLive")}
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center justify-center h-32 text-iron-600 text-xs">
              {tWorkspace("loadingLive")}
            </div>
          )}
        </Card>
      </div>

      {/* ═══ RIGHT COLUMN: Analysis (Distribution + Metrics) ═══ */}
      <div className="flex flex-col gap-4">
        {/* CARD 3: Distribution Analysis */}
        <Card className="flex flex-col">
          {activeChartMetric ? (
            <>
                <div className="flex flex-col mb-3">
                  <div className="flex w-full justify-between items-center">
                    <h3 className="text-base font-semibold text-iron-100 capitalize">
                      📊 {tWorkspace("cardDistribution")} ({activeChartMetric.replace(/_/g, ' ')})
                    </h3>
                    <div className="flex items-center gap-3">
                      {chartLoading && <span className="text-xs text-iron-500 animate-pulse">{tWorkspace("generatingDistHover")}</span>}
                      {chartUrl && chartData && (
                        <button
                          onClick={() => setIsInteractiveMode(!isInteractiveMode)}
                          className={`text-xs px-2 py-1 rounded transition-colors flex items-center gap-1 ${isInteractiveMode ? 'bg-risk-green/20 text-risk-green border border-risk-green/50' : 'bg-iron-800 text-iron-400 border border-iron-700 hover:text-iron-200'}`}
                          title="Toggle Superman Interactive Mode"
                        >
                          <span>🦸‍♂️</span> {isInteractiveMode ? 'Interactive' : 'Static'}
                        </button>
                      )}
                    </div>
                  </div>
                  {(() => {
                     try {
                       const guide = tMetrics(`${activeChartMetric}.chartGuide`);
                       if (guide && !guide.includes('chartGuide')) {
                         return (
                           <p className="text-xs text-iron-500 mt-1.5 leading-relaxed pr-4">
                             {guide}
                           </p>
                         );
                       }
                     } catch (e) { return null; }
                     return null;
                  })()}
                </div>
              <div className="w-full flex-1 flex justify-center bg-surface-tertiary rounded-lg border border-iron-800 p-2">
                 {isInteractiveMode && chartData ? (
                   <InteractiveDistribution chartData={chartData} loading={chartLoading} />
                 ) : chartUrl ? (
                   // eslint-disable-next-line @next/next/no-img-element
                   <img 
                     src={chartUrl} 
                     alt="Risk Chart" 
                     className={`object-contain max-h-[280px] transition-all ${isLightMode ? 'invert hue-rotate-180 mix-blend-multiply opacity-90' : 'mix-blend-screen'}`} 
                   />
                 ) : chartLoading ? (
                   <div className="flex items-center justify-center h-full w-full">
                       <span className="text-xs text-iron-500 animate-pulse">{tWorkspace("generatingDist")}</span>
                   </div>
                 ) : null}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-full min-h-[200px] text-iron-600 text-sm">
              {tWorkspace("clickMetricDist")}
            </div>
          )}
        </Card>

        {/* CARD 4: Risk Metrics Snapshot */}
        {activeAsset.metrics_snapshot && (
          <Card>
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-base font-semibold text-iron-100">
                🧮 {tWorkspace("cardRiskMetrics")}
              </h3>
              <div className="flex gap-2 items-center">
                <button 
                  onClick={() => setIsAlertsOpen(true)}
                  className="bg-surface-tertiary hover:bg-risk-blue/10 text-risk-blue border border-risk-blue/30 px-2 py-1 rounded-md text-xs transition-colors flex gap-1 items-center"
                  title="Configurar Alertas"
                >
                  <span>🔔</span> Alertas
                </button>
                {(() => {
                  const riskCfg = activeAsset.risk_config as Record<string, any> | null;
                  if (riskCfg?.last_updated) {
                    const d = new Date(riskCfg.last_updated);
                    return (
                      <span className="text-xs bg-iron-800 text-iron-400 px-2 py-1 rounded-md border border-iron-700 font-mono" title="Last EA Heartbeat Sync">
                        🕒 {d.toLocaleTimeString()}
                      </span>
                    );
                  }
                  return null;
                })()}
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
              {Object.entries(activeAsset.metrics_snapshot)
                .filter(([key]) => key !== "PnlMetric" && key !== "PnlPerTradeMetric" && key !== "combined_strategies" && key !== "strategy_names" && key !== "SimulationParameters" && key !== "bayes_cache")
                .sort(([keyA], [keyB]) => {
                  const order = ["DrawdownMetric", "DailyLossMetric", "StagnationDaysMetric", "StagnationTradesMetric", "ConsecutiveLossesMetric"];
                  const a = order.indexOf(keyA);
                  const b = order.indexOf(keyB);
                  return (a === -1 ? 99 : a) - (b === -1 ? 99 : b);
                })
                .map(([key, params]) => {
                const displayName = key.replace("Metric", "").replace(/([A-Z])/g, " $1").trim();
                
                let displayValue = 0;
                const maxKey = Object.keys(params as object).find((k) => k.startsWith("max_"));
                if (maxKey) displayValue = (params as Record<string, number>)[maxKey];
                
                const metricMap: Record<string, string> = {
                  DrawdownMetric: "max_drawdown",
                  DailyLossMetric: "daily_loss",
                  ConsecutiveLossesMetric: "consecutive_losses",
                  StagnationDaysMetric: "stagnation_days",
                  StagnationTradesMetric: "stagnation_trades",
                };
                const mappedKey = metricMap[key] || key;

                const riskCfg = activeAsset.risk_config as Record<string, Record<string, number>> | null;
                const hasHeartbeat = !!(riskCfg as any)?.last_updated;
                const liveCurrentVal = hasHeartbeat ? riskCfg?.[mappedKey]?.current : undefined;

                return (
                  <div key={key} 
                    onClick={() => openChart(mappedKey, liveCurrentVal, true)}
                    className={`rounded-lg p-3 text-center relative group cursor-pointer transition-all ${
                      activeChartMetric === mappedKey 
                        ? "bg-risk-green/10 border border-risk-green/30 shadow-[inset_0_0_15px_rgba(0,255,128,0.05)]" 
                        : "bg-surface-tertiary border border-transparent hover:border-iron-700 hover:bg-surface-elevated"
                    }`}
                  >
                    <div className="text-[10px] text-iron-400 font-semibold uppercase tracking-widest mb-2">
                      <MetricTooltip metricKey={hasHeartbeat && liveCurrentVal !== undefined ? `live_${mappedKey}` : mappedKey} variant="card">
                        {displayName}
                      </MetricTooltip>
                    </div>
                    <div className="flex flex-col items-center justify-center gap-1.5">
                      {(() => {
                        const formatted = hasHeartbeat && liveCurrentVal !== undefined
                          ? metricFormatter.format(mappedKey, liveCurrentVal)
                          : typeof displayValue === "number"
                            ? metricFormatter.format(mappedKey, displayValue)
                            : "—";
                        // Auto-scale: shorter strings get bigger text
                        const len = formatted.length;
                        const sizeClass = len <= 4 ? "text-xl" : len <= 8 ? "text-lg" : "text-base";
                        return (
                          <span className={`${sizeClass} font-mono text-iron-50 font-bold tracking-tight whitespace-nowrap`}>
                            {formatted}
                          </span>
                        );
                      })()}
                      {hasHeartbeat && liveCurrentVal !== undefined && (
                        <span className="text-[8px] bg-risk-green/20 text-risk-green border border-risk-green/30 px-1.5 py-0.5 rounded font-mono font-bold tracking-widest uppercase">{tWorkspace("liveBadge")}</span>
                      )}
                      {!hasHeartbeat && typeof displayValue === "number" && (
                        <span className="text-[8px] bg-iron-800 text-iron-400 border border-iron-700 px-1.5 py-0.5 rounded font-mono tracking-widest uppercase">{tWorkspace("cardBacktest")}</span>
                      )}
                    </div>
                    {hasHeartbeat && (
                      <div className="flex items-center justify-center gap-1.5 opacity-80 mt-2 bg-background border border-iron-800 px-2 py-0.5 rounded text-[10px]">
                        <span className="text-iron-500 font-semibold uppercase">{tWorkspace("maxBadge")}</span>
                        <span className="font-mono text-iron-300 whitespace-nowrap">
                          {typeof displayValue === "number" ? metricFormatter.format(mappedKey, displayValue) : "—"}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </Card>
        )}
      </div>

      {isAlertsOpen && accountId && (
        <AlertsDrawer 
          isOpen={isAlertsOpen} 
          onClose={() => setIsAlertsOpen(false)}
          strategies={storeStrategies}
          portfolios={storePortfolios}
          initialTargetId={activeAsset.id}
          accountId={accountId}
        />
      )}
    </div>
  );
};
