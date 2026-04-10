import React, { useState, useCallback, useEffect } from "react";
import InfoPopover from "@/components/ui/InfoPopover";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import type { Strategy, RiskAsset } from "@/types/strategy";
import { useTranslations, useLocale } from "next-intl";
import { metricFormatter } from "@/utils/MetricFormatter";
import { getVerdictStyle, getVerdictStyleFromPercentile, BAYES_THRESHOLDS, type VerdictStatus } from "@/utils/VerdictConfig";
import { RISK_METRIC_KEYS } from "@/config/metricsRegistry";
import { useMetrics } from "@/contexts/MetricsContext";
import api from "@/services/api";


// ─── Component ──────────────────────────────────────────────────

interface EditStrategyModalProps {
  strategy: RiskAsset;
  onSave: (id: string, updates: Partial<RiskAsset>) => Promise<boolean | RiskAsset | void>;
  onClose: () => void;
  onOpenChart?: (metricName: string, value: number) => void;
}

export default function EditStrategyModal({
  strategy,
  onSave,
  onClose,
  onOpenChart,
}: EditStrategyModalProps) {
  const t = useTranslations("pactoUlisesModal");
  const tVerdict = useTranslations("verdict");
  const locale = useLocale();
  const isPortfolio = "strategy_ids" in strategy;
  const [name, setName] = useState(strategy.name);
  const { getDef, RISK_KEYS } = useMetrics();
  
  // ─── Risk Variables from dynamic registry ──────────────────────
  const RISK_VARIABLES = RISK_KEYS.map((k) => {
    const def = getDef(k);
    return { key: def.key, label: def.label, unit: def.unit, snapKey: def.snapKey, icon: def.icon };
  });

  // ── Alert bell state (which metrics have active Telegram alerts) ──
  interface AlertInfo { id: string; metric_key: string; threshold_value: number; }
  const [alertRules, setAlertRules] = useState<AlertInfo[]>([]);
  const [originalAlertRules, setOriginalAlertRules] = useState<AlertInfo[]>([]);
  const [alertLoading, setAlertLoading] = useState<Set<string>>(new Set());
  const [alertToast, setAlertToast] = useState<{ key: string; msg: string; type: 'on' | 'off' } | null>(null);

  const targetType = isPortfolio ? "portfolio" : "strategy";

  useEffect(() => {
    // Fetch existing alerts for this asset
    api.get(`/api/alerts/${targetType}/${strategy.id}`)
      .then((res) => {
        const data = res.data || [];
        setAlertRules(data);
        setOriginalAlertRules(data);
        // If an alert exists, ensure its corresponding risk variable is enabled in the UI
        setRiskConfig(prev => {
          let updated = false;
          const next = { ...prev };
          data.forEach((rule: AlertInfo) => {
            if (next[rule.metric_key] && !next[rule.metric_key].enabled) {
              next[rule.metric_key] = { ...next[rule.metric_key], enabled: true };
              updated = true;
            }
          });
          return updated ? next : prev;
        });
      })
      .catch(() => {});
  }, [strategy.id, targetType]);

  const alertByMetric = (key: string) => alertRules.find((a) => a.metric_key === key);

  const toggleAlert = async (metricKey: string, thresholdValue: number) => {
    const existing = alertByMetric(metricKey);
    if (existing) {
      // Remove it locally
      setAlertRules((prev) => prev.filter((a) => a.metric_key !== metricKey));
      setAlertToast({ key: metricKey, msg: '🔕 Desactivado', type: 'off' });
    } else {
      // Add a pending alert locally
      setAlertRules((prev) => [...prev, { id: `pending-${metricKey}`, metric_key: metricKey, threshold_value: thresholdValue }]);
      setAlertToast({ key: metricKey, msg: '🔔 Telegram activado', type: 'on' });
    }
    setTimeout(() => setAlertToast(null), 2500);
  };

  const syncAlertThreshold = useCallback((metricKey: string, newVal: number) => {
    // We just update the local state if it exists. Revisions will be flushed on save.
    setAlertRules((prev) => prev.map((a) => a.metric_key === metricKey ? { ...a, threshold_value: newVal } : a));
  }, []);
  const [magicNumber, setMagicNumber] = useState(isPortfolio ? "0" : (strategy as Strategy).magic_number?.toString() || "0");
  const [magicAliases, setMagicAliases] = useState<number[]>(
    !isPortfolio ? (strategy as Strategy).magic_aliases || [] : []
  );
  const [riskMultiplier, setRiskMultiplier] = useState(!isPortfolio ? ((strategy as Strategy).risk_multiplier || 1.0) : 1.0);
  const [isSaving, setIsSaving] = useState(false);

  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [uploadError, setUploadError] = useState("");

  const handleReupload = async (files: FileList | null) => {
    if (isPortfolio) return;
    if (!files || files.length === 0) return;
    const file = Array.from(files).find(f => f.name.toLowerCase().endsWith(".csv") || f.name.toLowerCase().endsWith(".html"));
    if (!file) return;

    setUploadStatus("uploading");
    setUploadError("");

    try {
      const formData = new FormData();
      formData.append("trading_account_id", strategy.trading_account_id);
      formData.append("name", name);
      formData.append("description", "");
      formData.append("magic_number", magicNumber || "0");
      formData.append("start_date", "");
      formData.append("max_drawdown_limit", "0");
      formData.append("daily_loss_limit", "0");
      formData.append("skip_recalc", "true");
      formData.append("file", file);

      const { strategyAPI } = await import("@/services/api");
      await strategyAPI.upload(formData);
      
      setUploadStatus("done");
      setTimeout(() => {
         window.location.reload();
      }, 1500);
    } catch (err: any) {
      setUploadStatus("error");
      let msg = "Upload failed";
      if (err?.response?.data?.detail) {
          msg = typeof err.response.data.detail === "string" 
             ? err.response.data.detail 
             : "Validation error: Check inputs.";
      }
      setUploadError(msg);
    }
  };

  // ── Risk config state (OOP: each RiskVar maps to a toggleable limit) ──
  const defaultRiskConfig: Record<string, any> = { ...(strategy.risk_config as any || {}) };
  for (const rv of RISK_VARIABLES) {
    const existing = defaultRiskConfig[rv.key];
    defaultRiskConfig[rv.key] = {
      ...existing,
      enabled: existing?.enabled ?? false,
      limit: existing?.limit ?? (rv.key === 'bayes_p_positive' ? 50 : 0),
      p_amber: existing?.p_amber ?? 85,
      p_red: existing?.p_red ?? 95,
    };
  }
  const [riskConfig, setRiskConfig] = useState(defaultRiskConfig);

  const toggleRisk = (key: string) => {
    setRiskConfig((prev) => {
      const isEnabling = !prev[key].enabled;
      let newLimit = prev[key].limit;
      
      // Si el usuario activa el riesgo por primera vez y está a 0, autocompletar con el Percentil de su propio P-Rojo (ej. P95)
      if (isEnabling && newLimit === 0) {
          try {
             const targetPercentile = prev[key].p_red ?? BAYES_THRESHOLDS.P_RED;
             const distFit = (strategy as any).distribution_fit?.[key];
             const emp = distFit?.empirical_percentiles;
             
             if (emp && emp.length > targetPercentile) {
                 let inferredVal = emp[targetPercentile];
                 
                 const rvDef = RISK_VARIABLES.find(r => r.key === key);                 
                 const isInteger = ["days", "trades", ""].includes(rvDef?.unit || "");
                 newLimit = isInteger ? Math.round(inferredVal) : Number(inferredVal.toFixed(2));
             }
          } catch(e) {}
      }

      return {
        ...prev,
        [key]: { ...prev[key], enabled: isEnabling, limit: newLimit },
      };
    });
  };

  const setRiskLimit = (key: string, value: string) => {
    const numVal = parseFloat(value) || 0;
    setRiskConfig((prev) => ({
      ...prev,
      [key]: { ...prev[key], limit: numVal },
    }));
    // Auto-sync Telegram alert threshold if bell is active for this metric
    syncAlertThreshold(key, numVal);
  };



  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      let finalUpdates: any = {
        name,
        max_drawdown_limit: riskConfig.max_drawdown?.limit || 0,
        daily_loss_limit: riskConfig.daily_loss?.limit || 0,
        risk_config: riskConfig,
      };

      if (!isPortfolio) {
        finalUpdates = {
          ...finalUpdates,
          magic_number: parseInt(magicNumber, 10),
          magic_aliases: magicAliases,
        };
      }

      // Sync alerts based on local changes
      const alertPromises = [];

      // 1. Delete removed alerts
      for (const orig of originalAlertRules) {
        if (!alertRules.find(a => a.metric_key === orig.metric_key)) {
          alertPromises.push(api.delete(`/api/alerts/${orig.id}`).catch(console.error));
        }
      }

      // 2. Create or update alerts
      for (const rule of alertRules) {
        const metricKey = rule.metric_key;
        if (riskConfig[metricKey]?.enabled) { // Only process if pact is currently enabled
          const currentLimit = riskConfig[metricKey].limit;
          
          if (rule.id.startsWith("pending-")) {
            // New alert
            const def = getDef(metricKey);
            alertPromises.push(api.post("/api/alerts", {
              target_type: targetType,
              target_id: strategy.id,
              metric_key: metricKey,
              operator: def.defaultOperator || ">=",
              threshold_value: currentLimit,
              channel: "telegram",
              cooldown_minutes: def.defaultCooldown ?? 0,
            }).catch(console.error));
          } else {
            // Existing alert - check if threshold changed
            const orig = originalAlertRules.find(a => a.id === rule.id);
            if (orig && orig.threshold_value !== currentLimit) {
              alertPromises.push(api.patch(`/api/alerts/${rule.id}`, { threshold_value: currentLimit }).catch(console.error));
            }
          }
        }
      }

      await Promise.all(alertPromises);

      // Save strategy and trigger parent refresh (which fetches the final global alert count)
      await onSave(strategy.id, finalUpdates);

      // Apply multiplier ONLY if changed (avoids overwriting freshly saved risk_config)
      const currentMultiplier = !isPortfolio ? ((strategy as any).risk_multiplier || 1.0) : 1.0;
      if (!isPortfolio && riskMultiplier > 0 && riskMultiplier !== currentMultiplier) {
        const { strategyAPI } = await import("@/services/api");
        await strategyAPI.applyMultiplier(strategy.id, riskMultiplier);
      }

      onClose();
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-surface-secondary border border-iron-800 rounded-xl p-6 w-full max-w-xl shadow-2xl relative max-h-[90vh] overflow-y-auto">
        <button
           onClick={onClose}
           className="absolute top-4 right-4 text-iron-500 hover:text-iron-300"
        >
          ✕
        </button>

        <h3 className="text-xl font-bold text-iron-100 mb-6">Edit {isPortfolio ? "Portfolio" : "Strategy"}</h3>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-iron-300 mb-1">
                 Strategy Name
              </label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-iron-300 mb-1">
                 Primary Magic No.
              </label>
              <Input
                type="number"
                value={magicNumber}
                onChange={(e) => setMagicNumber(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-iron-300 mb-1">
                 Risk Multiplier
              </label>
              <Input
                type="text"
                value={riskMultiplier}
                onChange={(e) => {
                  const val = e.target.value.replace(',', '.');
                  const parsed = parseFloat(val);
                  setRiskMultiplier(isNaN(parsed) ? 1.0 : parsed);
                }}
                required
              />
            </div>
          </div>
          
          <div>
              <label className="block text-sm font-medium text-iron-300 mb-2">
                 Linked Magic Numbers (Aliases)
              </label>
              {magicAliases.length === 0 ? (
                <p className="text-xs text-iron-500 italic">No alternative magic numbers linked yet.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {magicAliases.map((alias) => (
                      <div key={alias} className="flex items-center gap-1 bg-surface-primary border border-iron-700 px-2.5 py-1 rounded-md text-xs font-mono text-iron-200">
                          {alias}
                          <button 
                            type="button"
                            onClick={() => setMagicAliases(prev => prev.filter(a => a !== alias))}
                            className="ml-1 text-iron-500 hover:text-risk-red transition-colors"
                          >
                            ✕
                          </button>
                      </div>
                  ))}
                </div>
              )}
          </div>

          {/* Re-Upload Backtest Component */}
          <div className="border border-iron-800 bg-surface-tertiary rounded-xl p-4 mt-4">
            <div className="flex justify-between items-center mb-2">
               <span className="text-xs font-semibold text-iron-200 uppercase tracking-wider">Update Backtest Data</span>
               {uploadStatus === "uploading" && <span className="text-amber-400 text-xs animate-pulse">Uploading & Recalculating... ⏳</span>}
               {uploadStatus === "done" && <span className="text-risk-green text-xs">✓ Done! Reloading...</span>}
               {uploadStatus === "error" && <span className="text-risk-red text-xs">✗ {uploadError}</span>}
            </div>
            
            <label
              onDrop={(e) => { e.preventDefault(); handleReupload(e.dataTransfer.files); }}
              onDragOver={(e) => e.preventDefault()}
              className={`flex flex-col items-center justify-center w-full h-24 border-2 border-dashed rounded-lg cursor-pointer transition-all duration-200 ${uploadStatus === 'uploading' ? 'opacity-50 pointer-events-none' : ''} ${uploadStatus === 'done' ? 'border-risk-green/50 bg-risk-green/5' : 'border-iron-700 hover:border-amber-500 hover:bg-amber-500/5'}`}
            >
              <div className="text-center flex flex-col items-center gap-1">
                <p className="text-xl">📄</p>
                <p className="text-iron-300 text-xs font-medium">Drop new CSV/HTML to update trades</p>
              </div>
              <input type="file" accept=".csv,.htm,.html" onChange={(e) => handleReupload(e.target.files)} className="hidden" />
            </label>
          </div>

          {/* Ulysses Pact Configuration */}
          <div className="border-t border-iron-700 pt-5 mt-4">
            <div className="text-xs uppercase text-amber-500 mb-4 tracking-wider font-semibold flex items-center gap-2">
              <span>{t('title')}</span>
              <InfoPopover content={
                <div className="space-y-3">
                  <p className="text-[11px] text-iron-300 leading-relaxed mb-2">{t('tooltipIntro')}</p>
                  <div className="bg-iron-900 border border-iron-800 rounded-lg p-2.5 space-y-2">
                    <div className="text-[10px] font-bold text-iron-500 uppercase tracking-wider mb-1">{t('legBayes')}</div>
                    {['amber', 'red'].map(key => {
                        const s = getVerdictStyle(key as VerdictStatus);
                        return (
                        <div key={key} className="flex gap-2 text-[10px] items-start mt-1">
                            <span className="mt-0.5">{s.icon}</span>
                            <div className="leading-tight">
                                <span className={`font-bold ${s.labelClass}`}>{tVerdict(s.labelKey as any)}</span> <span className="text-iron-400">— {tVerdict(s.descKey as any)}</span>
                            </div>
                        </div>
                        );
                    })}
                  </div>
                  <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-2.5 space-y-2">
                    <div className="text-[10px] font-bold text-red-500/70 uppercase tracking-wider mb-1">{t('legWall')}</div>
                    <div className="flex gap-2 text-[10px] items-start">
                        <span className="mt-0.5">{getVerdictStyle('fatal').icon}</span>
                        <div className="leading-tight">
                            <span className="font-bold text-red-500">{tVerdict('fatal_label')}</span> <span className="text-red-400/80">— {tVerdict('fatal_desc')}</span>
                        </div>
                    </div>
                  </div>
                  <p className="text-[11px] text-amber-500/80 font-medium italic mt-2">{t('tooltipOutro')}</p>
                </div>
              } width="w-80" position="bottom">
                <span className="text-[10px] cursor-pointer hover:opacity-80">ℹ️</span>
              </InfoPopover>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {RISK_VARIABLES.map((rv) => {
                const cfg = riskConfig[rv.key];
                
                let refValue: number | undefined;
                if (strategy.metrics_snapshot?.[rv.snapKey]) {
                    const params = strategy.metrics_snapshot[rv.snapKey] as Record<string, number>;
                    const maxKey = Object.keys(params || {}).find(k => k.startsWith("max_"));
                    if (maxKey) refValue = params[maxKey];
                }
                
                // Fallback to absolute max from empirical percentiles (index 100)
                if (refValue === undefined || refValue === 0) {
                    const distFit = (strategy as any)?.distribution_fit?.[rv.key];
                    if (distFit?.empirical_percentiles && distFit.empirical_percentiles.length === 101) {
                        refValue = distFit.empirical_percentiles[100];
                    }
                }


                // Revert cfg.limit to RAW dollar/days values, but compute pctLimit dynamically
                let rawValue = cfg?.limit || 0;
                
                let pctLimit = 100;
                if (refValue && refValue > 0) {
                    pctLimit = Math.round((rawValue / refValue) * 100);
                }

                const isInteger = ["days", "trades", ""].includes(rv.unit);
                const formatNum = (num: number) => {
                    return new Intl.NumberFormat('es-ES', { 
                        minimumFractionDigits: isInteger ? 0 : 1, 
                        maximumFractionDigits: isInteger ? 0 : 1 
                    }).format(num).replace(/,/g, '.');
                };

                // ── Compute the percentile for the current rawValue ──
                // Uses fitted CDF when available (passed=true), else empirical percentiles
                const distFitData = (strategy as any)?.distribution_fit?.[rv.key];
                const emp = distFitData?.empirical_percentiles as number[] | undefined;
                const fitPassed = distFitData?.passed === true;
                const fitParams = distFitData?.params as number[] | undefined;
                const fitName = distFitData?.distribution_name as string | undefined;
                
                let wallPercentile: number | null = null;
                let isTerraIncognita = false;
                
                if (cfg?.enabled && rawValue > 0) {
                    // Strategy 1: Use parametric CDF if we have a valid fit (normal/t → loc,scale approximation)
                    if (fitPassed && fitParams && fitParams.length >= 2 && fitName && fitName !== 'empirical') {
                        // For scipy distributions: last two params are always (loc, scale)
                        const loc = fitParams[fitParams.length - 2];
                        const scale = fitParams[fitParams.length - 1];
                        if (scale > 0) {
                            // Normal CDF approximation (works well for norm, t, logistic, etc.)
                            const z = (rawValue - loc) / scale;
                            const cdf = 0.5 * (1 + Math.tanh(Math.sqrt(2 / Math.PI) * (z + 0.044715 * z * z * z)));
                            wallPercentile = Math.round(Math.min(cdf * 100, 100));
                        }
                    }
                    
                    // Strategy 2: Fallback to empirical percentiles if no fit or fit failed
                    if (wallPercentile === null && emp && emp.length === 101) {
                        if (rawValue > emp[100]) {
                            wallPercentile = 100;
                            isTerraIncognita = true;
                        } else {
                            let lo = 0, hi = 100;
                            while (lo < hi) {
                                const mid = (lo + hi) >> 1;
                                if (emp[mid] < rawValue) lo = mid + 1;
                                else hi = mid;
                            }
                            wallPercentile = Math.min(lo, 100);
                        }
                    }
                    
                    // If we used fitted CDF and value exceeds the empirical max, mark as terra incognita
                    if (wallPercentile !== null && emp && emp.length === 101 && rawValue > emp[100]) {
                        isTerraIncognita = true;
                    }
                }
                
                // Use shared VerdictConfig for colors and terrain labels
                const verdict = getVerdictStyleFromPercentile(wallPercentile, isTerraIncognita);
                const percentileColor = wallPercentile !== null ? verdict.textColor : 'text-iron-500';
                const percentileBorderColor = wallPercentile !== null ? verdict.borderColor : '';
                const terrain = wallPercentile !== null ? { icon: verdict.icon, label: tVerdict(verdict.labelKey as any), desc: tVerdict(verdict.descKey as any) } : null;

                return (
                  <div key={rv.key} className={`p-3 rounded-lg border flex flex-col gap-2 ${cfg?.enabled ? 'border-amber-500/50 bg-amber-500/5' : 'border-iron-800 bg-surface-primary'}`}>
                    <div className="flex flex-col gap-2">
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={cfg?.enabled || false} onChange={() => toggleRisk(rv.key)} className="accent-amber-500" />
                          <span className="text-xs font-semibold text-iron-200 line-clamp-1">{rv.icon} {rv.label}</span>
                        </label>
                        
                        {cfg?.enabled && (
                          <div className="relative flex items-center">
                            <button
                              type="button"
                              onClick={(e) => { e.preventDefault(); toggleAlert(rv.key, rawValue); }}
                              disabled={alertLoading.has(rv.key)}
                              title={alertByMetric(rv.key) ? (locale === 'es' ? 'Alerta configurada — Clic para desactivar' : 'Alert configured — Click to disable') : (locale === 'es' ? 'Activar alerta de Telegram' : 'Enable Telegram alert')}
                              className={`text-sm transition-all duration-300 px-1.5 py-0.5 rounded-md border ${
                                alertByMetric(rv.key)
                                  ? 'text-risk-blue border-risk-blue/40 bg-risk-blue/10 shadow-[0_0_8px_rgba(59,130,246,0.2)]'
                                  : 'text-iron-600 border-iron-700/50 hover:text-iron-400 hover:border-iron-600'
                              } ${alertLoading.has(rv.key) ? 'opacity-50 cursor-wait' : ''}`}
                            >
                              {alertByMetric(rv.key) ? '🔔' : '🔕'}
                            </button>
                            {alertToast?.key === rv.key && (
                              <span className={`absolute -top-7 right-0 whitespace-nowrap text-[10px] px-2 py-0.5 rounded animate-fade-in z-10 border ${
                                alertToast.type === 'on' 
                                  ? 'text-risk-blue bg-risk-blue/10 border-risk-blue/30'
                                  : 'text-iron-400 bg-iron-800 border-iron-700'
                              }`}>
                                {alertToast.msg}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      
                      <div className="flex items-center justify-end gap-1.5 w-full">
                        {cfg?.enabled && wallPercentile !== null && (
                          <span 
                            className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded border ${percentileColor} ${percentileBorderColor} bg-iron-900/80 transition-colors cursor-help`}
                            title={
                              isTerraIncognita
                                ? locale === 'es' ? "Terra Incognita: Tu límite está por encima del peor escenario jamás registrado en tu backtest histórico." : "Terra Incognita: Your limit is beyond the worst scenario ever registered in your historical backtest."
                                : locale === 'es' ? `Percentil Estático: El ${wallPercentile}% de tu historial fue mejor o igual a este límite. Solo hay un ${100 - wallPercentile}% de casos peores.` : `Static Percentile: ${wallPercentile}% of your history was better than or equal to this limit. Only ${100 - wallPercentile}% of cases are worse.`
                            }
                          >
                            {isTerraIncognita ? '>P100' : `P${wallPercentile}`}
                          </span>
                        )}
                        {cfg?.enabled && (rv.key === 'bayes_p_positive' ? (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setRiskLimit(rv.key, "50")}
                              className="text-xs text-iron-400 hover:text-amber-400 focus:outline-none flex items-center bg-surface-primary hover:bg-amber-500/10 px-1.5 py-0.5 rounded border border-iron-700 hover:border-amber-500/50 transition-colors"
                              title={locale === 'es' ? "Restaurar a 50%" : "Restore to 50%"}
                            >
                              ↺
                            </button>
                            <span 
                              className="font-mono text-xs text-amber-400 cursor-pointer hover:underline" 
                              onClick={() => setRiskLimit(rv.key, "50")} 
                              title={locale === 'es' ? `Carga Básica: Límite al 50%. Click para resetear al 50%.` : `Basic Load: Limit at 50%. Click to reset to 50%.`}
                            >
                              50%
                            </span>
                          </div>
                        ) : (refValue !== undefined && refValue > 0 && (
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => setRiskLimit(rv.key, String(refValue))}
                              className="text-xs text-iron-400 hover:text-amber-400 focus:outline-none flex items-center bg-surface-primary hover:bg-amber-500/10 px-1.5 py-0.5 rounded border border-iron-700 hover:border-amber-500/50 transition-colors"
                              title={locale === 'es' ? "Restaurar a 100% (Máx Histórico)" : "Restore to 100% (Historical Max)"}
                            >
                              ↺
                            </button>
                            <span 
                              className="font-mono text-xs text-amber-400 cursor-pointer hover:underline" 
                              onClick={() => setRiskLimit(rv.key, String(refValue))} 
                              title={locale === 'es' ? `Carga Relativa: Este límite equivale al ${pctLimit}% de tu peor escenario histórico. Click para resetear al 100%.` : `Relative Load: This limit equals ${pctLimit}% of your worst historical scenario. Click to reset to 100%.`}
                            >
                              {pctLimit}%
                            </span>
                          </div>
                        )))}
                        <input
                           type="number"
                           disabled={!cfg?.enabled}
                           value={rawValue}
                           step={isInteger ? "1" : "0.1"}
                           onChange={(e) => setRiskLimit(rv.key, e.target.value)}
                           className={`w-24 bg-surface-primary border border-iron-700 text-iron-200 rounded px-2 py-0.5 text-xs font-mono outline-none focus:border-amber-500 text-right ${!cfg?.enabled ? 'opacity-30' : ''}`}
                        />
                      </div>
                    </div>
                    
                    {cfg?.enabled && (rv.key === 'bayes_p_positive' ? (
                      <input 
                        type="range" min={0} max={100} step={1} 
                        value={rawValue} 
                        onChange={(e) => setRiskLimit(rv.key, e.target.value)}
                        className="w-full accent-amber-500" 
                      />
                    ) : (refValue !== undefined && refValue > 0 && (
                      <input 
                        type="range" min={10} max={300} step={1} 
                        value={pctLimit > 300 ? 300 : pctLimit} 
                        onChange={(e) => {
                           const newPct = parseInt(e.target.value, 10);
                           setRiskLimit(rv.key, String((refValue! * newPct) / 100));
                        }}
                        className="w-full accent-amber-500" 
                      />
                    )))}
                    
                    <div className="flex justify-between mt-1 text-[10px] text-iron-500 font-mono tracking-wider">
                      {terrain && (
                        <span className={`${percentileColor} transition-colors flex items-center gap-1`} title={terrain.desc}>
                          {terrain.icon} {terrain.label}
                        </span>
                      )}
                      {rv.key === 'bayes_p_positive' ? (
                        <span className="text-iron-500 text-[10px]">{locale === 'es' ? 'Evaluación Bayesiana Mínima Requerida' : 'Minimum Required Bayesian Evaluation'}</span>
                      ) : (
                        <span>{t('maxLabel')}: {refValue !== undefined ? metricFormatter.format(rv.key, refValue) : 'N/A'}</span>
                      )}
                    </div>

                    {/* Educational Accordion */}
                    <details className="mt-2 group">
                      <summary className="text-[10px] text-amber-500/70 hover:text-amber-500 cursor-pointer list-none flex items-center gap-1 font-semibold uppercase tracking-wider transition-colors outline-none select-none">
                        <span className="group-open:rotate-90 transition-transform duration-200 text-[8px]">▶</span>
                        {t('educationTitle')}
                      </summary>
                      <p className="text-[10px] text-iron-400 mt-1.5 pl-2.5 ml-1 border-l border-iron-700/50 leading-relaxed bg-iron-900/30 py-1.5 pr-2 rounded-r">
                        {t(`education.${rv.key}` as any)}
                      </p>
                    </details>

                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-8">
            <Button type="button" variant="ghost" onClick={onClose}>
               Cancel
            </Button>
            <Button type="submit" isLoading={isSaving} className="bg-risk-blue hover:bg-risk-blue/90 text-white">
               Save Changes
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
