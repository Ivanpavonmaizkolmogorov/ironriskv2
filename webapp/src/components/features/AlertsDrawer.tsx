"use client";

import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useTranslations, useLocale } from "next-intl";
import api from "@/services/api";
import { useMetrics } from "@/contexts/MetricsContext";
import { getVerdictStyleFromPercentile } from "@/utils/VerdictConfig";
import { metricFormatter } from "@/utils/MetricFormatter";
import type { Strategy, Portfolio } from "@/types/strategy";

/* ═══════════════════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════════════════ */

interface AlertsDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  /** All strategies in the account */
  strategies: Strategy[];
  /** All portfolios in the account */
  portfolios: Portfolio[];
  /** Optional: pre-select this asset when opening */
  initialTargetId?: string;
  /** The trading account ID to use for account-level alerts */
  accountId: string;
}

interface AlertRule {
  id: string;
  metric_key: string;
  operator: string;
  threshold_value: number;
  channel: string;
  is_active: boolean;
  target_type: string;
  target_id: string;
  [k: string]: any;
}

type AssetOption = { id: string; name: string; type: "strategy" | "portfolio"; data: Strategy | Portfolio };

/* ═══════════════════════════════════════════════════════════
   HELPERS — BT context & percentile
   ═══════════════════════════════════════════════════════════ */

function getBtMaxValue(
  metricKey: string,
  getDef: (k: string) => any,
  metricsSnapshot?: Record<string, any> | null,
  distributionFit?: Record<string, any> | null
): number | undefined {
  const def = getDef(metricKey);
  if (!def.snapKey) return undefined;
  if (metricsSnapshot?.[def.snapKey]) {
    const params = metricsSnapshot[def.snapKey] as Record<string, number>;
    const maxKey = Object.keys(params || {}).find((k) => k.startsWith("max_"));
    if (maxKey && params[maxKey] > 0) return params[maxKey];
  }
  const distFit = distributionFit?.[metricKey];
  if (distFit?.empirical_percentiles?.length === 101) return distFit.empirical_percentiles[100];
  return undefined;
}

function computePercentile(
  value: number,
  metricKey: string,
  distributionFit?: Record<string, any> | null
): { percentile: number | null; isTerraIncognita: boolean } {
  if (!distributionFit || value <= 0) return { percentile: null, isTerraIncognita: false };
  const distFitData = distributionFit[metricKey];
  const emp = distFitData?.empirical_percentiles as number[] | undefined;
  const fitPassed = distFitData?.passed === true;
  const fitParams = distFitData?.params as number[] | undefined;
  const fitName = distFitData?.distribution_name as string | undefined;
  let wallPercentile: number | null = null;
  let isTerraIncognita = false;
  if (fitPassed && fitParams && fitParams.length >= 2 && fitName && fitName !== "empirical") {
    const loc = fitParams[fitParams.length - 2];
    const scale = fitParams[fitParams.length - 1];
    if (scale > 0) {
      const z = (value - loc) / scale;
      const cdf = 0.5 * (1 + Math.tanh(Math.sqrt(2 / Math.PI) * (z + 0.044715 * z * z * z)));
      wallPercentile = Math.round(Math.min(cdf * 100, 100));
    }
  }
  if (wallPercentile === null && emp && emp.length === 101) {
    if (value > emp[100]) { wallPercentile = 100; isTerraIncognita = true; }
    else {
      let lo = 0, hi = 100;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (emp[mid] < value) lo = mid + 1; else hi = mid; }
      wallPercentile = Math.min(lo, 100);
    }
  }
  if (wallPercentile !== null && emp && emp.length === 101 && value > emp[100]) isTerraIncognita = true;
  return { percentile: wallPercentile, isTerraIncognita };
}

/* ═══════════════════════════════════════════════════════════
   EDITABLE VALUE (for active rules in left panel)
   ═══════════════════════════════════════════════════════════ */

function EditableValue({ alert, onSave }: { alert: AlertRule; onSave: (id: string, val: number) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(alert.threshold_value));
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { getDef } = useMetrics();
  const info = getDef(alert.metric_key);
  useEffect(() => { if (editing) { inputRef.current?.focus(); inputRef.current?.select(); } }, [editing]);
  useEffect(() => { if (!editing) setDraft(String(alert.threshold_value)); }, [alert.threshold_value, editing]);
  const commit = async () => {
    const num = Number(draft);
    if (!isNaN(num) && num > 0 && num !== alert.threshold_value) { setSaving(true); await onSave(alert.id, num); setSaving(false); }
    setEditing(false);
  };
  if (editing) {
    return (
      <span className="inline-flex items-center gap-1">
        <input ref={inputRef} type="number" value={draft}
          onChange={(e) => setDraft(e.target.value)} onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(String(alert.threshold_value)); setEditing(false); } }}
          className="w-20 bg-iron-900 border-2 border-risk-blue text-white rounded-md px-2 py-0.5 text-sm font-mono outline-none text-center shadow-[0_0_12px_rgba(59,130,246,0.25)]"
          min={0} step="any" />
        <span className="text-[10px] text-iron-500 font-mono">{info.unit}</span>
      </span>
    );
  }
  return (
    <button onClick={() => setEditing(true)}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-mono text-xs font-bold bg-iron-900/80 border border-iron-700 hover:border-risk-blue/60 text-iron-100 hover:text-risk-blue cursor-pointer transition-all duration-150 group/val ${saving ? "animate-pulse" : ""}`}
      title="Clic para editar">
      {metricFormatter.format(alert.metric_key, alert.threshold_value)}
      <svg className="w-2.5 h-2.5 text-iron-600 group-hover/val:text-risk-blue/80 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
      </svg>
    </button>
  );
}

function EditableCooldown({ alert, onSave }: { alert: AlertRule; onSave: (id: string, val: number) => Promise<void> }) {
  const t = useTranslations("alertsCenter");
  const [editing, setEditing] = useState(false);
  const { getDef } = useMetrics();
  const info = getDef(alert.metric_key);
  const defaultCooldown = info.defaultCooldown;
  const currentVal = alert.cooldown_minutes || defaultCooldown;
  const [draft, setDraft] = useState(String(currentVal));
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  
  useEffect(() => { if (editing) { inputRef.current?.focus(); inputRef.current?.select(); } }, [editing]);
  useEffect(() => { if (!editing) setDraft(String(currentVal)); }, [currentVal, editing]);
  
  const commit = async () => {
    const num = Math.round(Number(draft));
    if (!isNaN(num) && num >= 0 && num !== alert.cooldown_minutes) { 
      setSaving(true); 
      await onSave(alert.id, num); 
      setSaving(false); 
    }
    setEditing(false);
  };
  
  if (editing) {
    return (
      <span className="inline-flex items-center gap-0.5">
        <span className="text-[10px] text-iron-600">⏱</span>
        <input ref={inputRef} type="number" value={draft}
          onChange={(e) => setDraft(e.target.value)} onBlur={commit}
          onKeyDown={(e) => { if (e.key === "Enter") commit(); if (e.key === "Escape") { setDraft(String(currentVal)); setEditing(false); } }}
          className="w-12 bg-iron-900 border border-risk-blue text-white rounded px-1 py-0.5 text-[10px] font-mono outline-none text-center shadow-[0_0_8px_rgba(59,130,246,0.2)]"
          min={0} step={1} />
        <span className="text-[9px] text-iron-500 font-mono">{draft === "0" ? "solo" : "m"}</span>
      </span>
    );
  }
  
  return (
    <button onClick={() => setEditing(true)}
      className={`inline-flex items-center gap-0.5 text-[9px] font-mono shrink-0 cursor-pointer text-iron-600 hover:text-risk-blue transition-colors px-1 py-0.5 rounded hover:bg-iron-800 ${saving ? "animate-pulse" : ""}`}
      title={currentVal === 0 ? t("cooldownOne") : t("cooldownVal", { val: currentVal })}>
      {currentVal === 0 ? t("cooldownBtnOne") : t("cooldownBtnVal", { val: currentVal })}
    </button>
  );
}

/* ═══════════════════════════════════════════════════════════
   SLIDER CARD (right panel — for adding alerts)
   ═══════════════════════════════════════════════════════════ */

function SliderCard({ metricKey, onAdd, alreadyExists, activeRule, onUpdate, onUpdateCooldown, onDelete, asset }: {
  metricKey: string; onAdd: (key: string, value: number, cooldown?: number) => Promise<void>; 
  alreadyExists: boolean; activeRule?: AlertRule;
  onUpdate?: (id: string, val: number) => Promise<void>;
  onUpdateCooldown?: (id: string, val: number) => Promise<void>;
  onDelete?: (id: string) => Promise<void>;
  asset: AssetOption;
}) {
  const t = useTranslations("alertsCenter");
  const locale = useLocale();
  const { getDef } = useMetrics();
  const def = getDef(metricKey);
  const refValue = getBtMaxValue(metricKey, getDef, asset.data.metrics_snapshot, (asset.data as any).distribution_fit);
  const hasBtData = refValue !== undefined && refValue > 0;
  const fallbackValue = metricKey === "ea_disconnect_minutes" ? 1 : metricKey === "bayes_blind_risk" ? 50 : 0;
  const [rawValue, setRawValue] = useState(hasBtData ? refValue : fallbackValue);
  const [cooldownValue, setCooldownValue] = useState(def.defaultCooldown);
  const [adding, setAdding] = useState(false);
  const pctLimit = hasBtData ? Math.round((rawValue / refValue!) * 100) : 0;
  const isInteger = ["days", "trades", "ops", "min", ""].includes(def.unit);
  const { percentile, isTerraIncognita } = hasBtData ? computePercentile(rawValue, metricKey, (asset.data as any).distribution_fit) : { percentile: null, isTerraIncognita: false };
  const verdict = getVerdictStyleFromPercentile(percentile, isTerraIncognita);

  // Reset when asset changes
  useEffect(() => {
    const newRef = getBtMaxValue(metricKey, getDef, asset.data.metrics_snapshot, (asset.data as any).distribution_fit);
    setRawValue(newRef && newRef > 0 ? newRef : fallbackValue);
    setCooldownValue(def.defaultCooldown);
  }, [asset.id, metricKey, def.defaultCooldown]);

  const handleAddSubmit = async () => {
    if (adding || alreadyExists || rawValue <= 0) return;
    setAdding(true); await onAdd(metricKey, rawValue, cooldownValue); setAdding(false);
  };

  return (
    <div className={`relative bg-surface-tertiary border rounded-xl p-3.5 transition-all duration-200
      ${alreadyExists ? "border-risk-green/30 opacity-50" : "border-iron-700/60 hover:border-iron-600"}`}>
      {alreadyExists && (
        <div className="absolute top-2.5 right-2.5">
          <span className="text-[9px] bg-risk-green/20 text-risk-green border border-risk-green/30 px-1.5 py-0.5 rounded-full font-semibold uppercase tracking-wider">{t("activeBadge")}</span>
        </div>
      )}
      <div className="flex items-start gap-2.5 mb-2.5">
        <span className="text-xl leading-none mt-0.5">{def.icon}</span>
        <div className="min-w-0">
          <p className="text-xs font-bold text-iron-100 leading-tight">{locale === 'es' ? (def.labelEs || def.label) : def.label}</p>
          <p className="text-[10px] text-iron-500 mt-0.5 leading-snug line-clamp-3">{locale === 'es' ? (def.tooltipEs || def.tooltip) : def.tooltip}</p>
        </div>
      </div>
      {!alreadyExists && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              {percentile !== null && (
                <span className={`font-mono text-[10px] font-bold px-1.5 py-0.5 rounded border ${verdict.textColor} ${verdict.borderColor} bg-iron-900/80`}>
                  {isTerraIncognita ? ">P100" : `P${percentile}`}
                </span>
              )}
              {hasBtData && (
                <>
                  <button type="button" onClick={() => setRawValue(refValue!)}
                    className="text-xs text-iron-400 hover:text-amber-400 bg-surface-primary hover:bg-amber-500/10 px-1 py-0.5 rounded border border-iron-700 hover:border-amber-500/50 transition-colors">↺</button>
                  <span className="font-mono text-xs text-amber-400 cursor-pointer hover:underline" onClick={() => setRawValue(refValue!)}>{pctLimit}%</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-1">
              <input type="number" value={isInteger ? Math.round(rawValue) : Number(rawValue.toFixed(2))}
                step={isInteger ? "1" : "0.1"} onChange={(e) => setRawValue(parseFloat(e.target.value) || 0)}
                onKeyDown={(e) => e.key === "Enter" && handleAddSubmit()}
                className="w-20 bg-iron-900 border border-iron-700 text-iron-200 rounded px-2 py-1 text-[11px] font-mono outline-none focus:border-risk-blue/50 text-right" min={0} />
              <span className="text-[10px] text-iron-500 font-mono w-5">{def.unit}</span>
            </div>
          </div>
          {hasBtData && (
            <>
              <input type="range" min={10} max={300} step={1}
                value={pctLimit > 300 ? 300 : pctLimit}
                onChange={(e) => setRawValue((refValue! * parseInt(e.target.value, 10)) / 100)}
                className="w-full accent-amber-500" />
              <div className="flex justify-between text-[10px] text-iron-500 font-mono tracking-wider">
                {percentile !== null && (
                  <span className={`${verdict.textColor} flex items-center gap-1`}>
                    {verdict.icon} {isTerraIncognita ? "TERRA INCOGNITA" : percentile >= 95 ? "ANOMALY" : percentile >= 85 ? "VIGILANCIA" : "NORMAL"}
                  </span>
                )}
                <span>Máx Backtest: {metricFormatter.format(metricKey, refValue!)}</span>
              </div>
            </>
          )}
          <div className="flex items-center justify-between mt-2.5 mb-1 bg-iron-900/40 px-2 py-1.5 rounded border border-iron-800/40 overflow-visible">
            <span className="text-[9px] text-iron-500 font-mono tracking-wide uppercase group/label flex items-center gap-1 cursor-help relative">
              {t("cooldownLabel")}
              <span className="text-iron-600">ⓘ</span>
              <div className="opacity-0 group-hover/label:opacity-100 absolute bottom-full left-0 mb-1 transition-opacity text-[10px] bg-iron-800 text-iron-200 border border-iron-700 p-2 rounded shadow-xl w-[200px] normal-case tracking-normal z-[60] pointer-events-none">
                {t("cooldownTooltip")}
              </div>
            </span>
            <div className="group relative flex items-center gap-1">
              <span className="text-[10px] text-iron-600">⏱</span>
              <input type="number" min={0} step={1}
                value={cooldownValue} onChange={(e) => setCooldownValue(Math.max(0, parseInt(e.target.value) || 0))}
                className="w-12 bg-iron-900 border border-iron-700 text-iron-200 rounded px-1 py-0.5 text-[10px] font-mono outline-none focus:border-risk-blue/50 text-right" />
              <span className="text-[9px] text-iron-500 font-mono">min</span>
              <div className="opacity-0 group-hover:opacity-100 absolute bottom-full right-0 mb-1 pointer-events-none transition-opacity text-[10px] bg-iron-800 text-iron-200 border border-iron-700 px-2 py-1 rounded shadow-xl whitespace-nowrap z-50">
                {cooldownValue === 0 ? t("cooldownOne") : t("cooldownVal", { val: cooldownValue })}
              </div>
            </div>
          </div>
          <button onClick={handleAddSubmit} disabled={adding || rawValue <= 0}
            className="w-full bg-risk-blue/15 hover:bg-risk-blue/30 text-risk-blue border border-risk-blue/30 hover:border-risk-blue/50 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed active:scale-[0.98] flex items-center justify-center gap-1.5">
            {adding ? <span className="inline-block w-3.5 h-3.5 border-2 border-risk-blue/40 border-t-risk-blue rounded-full animate-spin" /> : <span>🔔 {t("activateAlert")}</span>}
          </button>
        </div>
      )}
      {alreadyExists && activeRule && onUpdate && onUpdateCooldown && onDelete && (
        <div className="pt-2.5 mt-3 border-t border-iron-800/40 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-iron-500 font-mono">{activeRule.operator}</span>
            <EditableValue alert={activeRule} onSave={onUpdate} />
            <EditableCooldown alert={activeRule} onSave={onUpdateCooldown} />
          </div>
          <button onClick={() => onDelete(activeRule.id)}
            className="text-[10px] text-risk-red hover:text-red-400 font-semibold px-2 py-0.5 rounded bg-risk-red/10 hover:bg-risk-red/20 transition-colors">
            Eliminar
          </button>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   ACCOUNT HEALTH CARD (Vigilante Vital — account level)
   ═══════════════════════════════════════════════════════════ */

function AccountHealthCard({ allAlerts, onAdd, onDelete, onUpdate }: {
  allAlerts: AlertRule[]; onAdd: (key: string, val: number) => Promise<void>; onDelete: (id: string) => Promise<void>; onUpdate: (id: string, val: number) => Promise<void>;
}) {
  const t = useTranslations("alertsCenter");
  const locale = useLocale();
  const { getDef } = useMetrics();
  const eaDef = getDef("ea_disconnect_minutes");
  const existingAlert = allAlerts.find(a => a.metric_key === "ea_disconnect_minutes");
  const [threshold, setThreshold] = useState(existingAlert?.threshold_value || 5);
  const [saving, setSaving] = useState(false);

  const handleToggle = async () => {
    setSaving(true);
    if (existingAlert) {
      await onDelete(existingAlert.id);
    } else {
      await onAdd("ea_disconnect_minutes", threshold);
    }
    setSaving(false);
  };

  return (
    <div className={`rounded-lg border p-2.5 transition-all duration-200 ${existingAlert ? 'border-risk-green/30 bg-risk-green/5' : 'border-iron-700/40 bg-surface-tertiary/40'}`}>
      <div className="flex items-center gap-2">
        <span className="text-base">{eaDef.icon}</span>
        <div className="flex-1 min-w-0">
          <p className="text-[11px] font-semibold text-iron-200">{locale === 'es' ? (eaDef.labelEs || eaDef.label) : eaDef.label}</p>
          <p className="text-[9px] text-iron-500 leading-tight">{t("monitorDesc")}</p>
        </div>
        {!existingAlert && (
          <div className="flex items-center gap-1">
            <input type="number" value={threshold} onChange={(e) => setThreshold(Number(e.target.value) || 1)}
              className="w-10 bg-iron-900 border border-iron-700 text-iron-200 rounded px-1.5 py-0.5 text-[10px] font-mono outline-none focus:border-risk-blue/50 text-center" min={1} />
            <span className="text-[9px] text-iron-600 font-mono">min</span>
          </div>
        )}
        {existingAlert && (
          <div className="flex items-center gap-1 font-mono text-risk-green font-bold">
            <span className="text-[10px]">≥</span>
            <EditableValue alert={existingAlert} onSave={onUpdate} />
          </div>
        )}
        <button onClick={handleToggle} disabled={saving}
          className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all duration-150 active:scale-95
            ${existingAlert
              ? 'bg-risk-red/15 text-risk-red border border-risk-red/30 hover:bg-risk-red/25'
              : 'bg-risk-green/15 text-risk-green border border-risk-green/30 hover:bg-risk-green/25'
            } disabled:opacity-40`}>
          {saving ? '...' : existingAlert ? t("remove") : t("activate")}
        </button>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   TELEGRAM LINK SECTION (deep link flow)
   ═══════════════════════════════════════════════════════════ */

function TelegramLinkSection({ onLinked }: { onLinked?: () => void }) {
  const t = useTranslations("alertsCenter");
  const [status, setStatus] = useState<"loading" | "linked" | "unlinked" | "pending">("loading");
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);

  // Check status on mount
  useEffect(() => {
    checkStatus();
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, []);

  const checkStatus = async () => {
    try {
      const res = await api.get("/api/telegram/status");
      setStatus(res.data.is_linked ? "linked" : "unlinked");
    } catch { setStatus("unlinked"); }
  };

  const startLinking = async () => {
    try {
      const res = await api.post("/api/telegram/generate-link", { locale: "es" });
      setDeepLink(res.data.link);
      setStatus("pending");

      // Start polling for verification every 3 seconds
      pollRef.current = setInterval(async () => {
        try {
          const verify = await api.post("/api/telegram/verify-link");
          if (verify.data.status === "linked") {
            setStatus("linked");
            setDeepLink(null);
            if (pollRef.current) clearInterval(pollRef.current);
            if (onLinked) onLinked();
          }
        } catch { /* keep polling */ }
      }, 3000);
    } catch (e) { console.error(e); }
  };

  return (
    <div className="px-5 py-3 border-t border-iron-800/40 shrink-0">
      <div className="flex items-center gap-2 text-[11px]">
        <span className="text-base">📡</span>
        <span className="text-iron-500 font-medium">{t("telegram")}</span>

        {status === "loading" && (
          <span className="ml-auto text-[10px] text-iron-600 font-mono">{t("loading").toLowerCase()}</span>
        )}

        {status === "linked" && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-[10px] text-iron-600 font-mono flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-risk-green animate-pulse" />
              {t("connected")}
            </span>
            <button onClick={async () => {
              try { await api.delete("/api/telegram/link"); setStatus("unlinked"); } 
              catch (e) { console.error(e); }
            }} className="text-[9px] font-bold text-iron-500 hover:text-risk-red transition-colors ml-1" title={t("disconnect")}>
              {t("disconnect")}
            </button>
          </div>
        )}

        {status === "unlinked" && (
          <button onClick={startLinking}
            className="ml-auto text-[10px] font-bold bg-risk-blue/15 text-risk-blue border border-risk-blue/30 hover:bg-risk-blue/25 px-2.5 py-1 rounded-md transition-all active:scale-95">
            🔗 {t("linkTelegram")}
          </button>
        )}
      </div>

      {status === "pending" && deepLink && (
        <div className="mt-2 p-2.5 rounded-lg border border-amber-500/30 bg-amber-500/5">
          <p className="text-[10px] text-iron-400 mb-1.5">
            1. {t("step1")}:
          </p>
          <a href={deepLink} target="_blank" rel="noopener noreferrer"
            className="block text-[11px] font-mono text-amber-400 hover:text-amber-300 underline truncate break-all">
            {deepLink}
          </a>
          <p className="text-[10px] text-iron-400 mt-1.5">
            2. {t("step2")}
          </p>
          <p className="text-[9px] text-iron-600 mt-1 flex items-center gap-1">
            <span className="inline-block w-2.5 h-2.5 border-2 border-iron-600 border-t-amber-400 rounded-full animate-spin" />
            {t("waiting")}
          </p>
        </div>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   SEARCHABLE ASSET SELECTOR (combobox)
   ═══════════════════════════════════════════════════════════ */

function SearchableAssetSelector({ assets, selectedIdx, onSelect }: {
  assets: AssetOption[]; selectedIdx: number; onSelect: (idx: number) => void;
}) {
  const t = useTranslations("alertsCenter");
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = assets[selectedIdx];

  const filtered = useMemo(() => {
    if (!search.trim()) return assets.map((a, i) => ({ asset: a, originalIdx: i }));
    const q = search.toLowerCase();
    return assets
      .map((a, i) => ({ asset: a, originalIdx: i }))
      .filter(({ asset }) => asset.name.toLowerCase().includes(q));
  }, [assets, search]);

  // Click outside to close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  // Focus input when opened
  useEffect(() => { if (isOpen) { inputRef.current?.focus(); setSearch(""); setHighlightIdx(-1); } }, [isOpen]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setHighlightIdx(i => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHighlightIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === "Enter" && highlightIdx >= 0 && highlightIdx < filtered.length) {
      e.preventDefault(); onSelect(filtered[highlightIdx].originalIdx); setIsOpen(false);
    }
    else if (e.key === "Escape") { setIsOpen(false); }
  };

  if (!isOpen) {
    return (
      <button onClick={() => setIsOpen(true)}
        className="bg-iron-900 border border-iron-700 hover:border-risk-blue/50 text-iron-100 rounded-lg px-3 py-1.5 text-xs font-semibold outline-none transition-colors max-w-[320px] truncate flex items-center gap-1.5 cursor-pointer">
        <span className="truncate">{selected?.type === 'portfolio' ? '📁 ' : ''}{selected?.name || '—'}</span>
        <svg className="w-3 h-3 text-iron-500 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </button>
    );
  }

  return (
    <div ref={containerRef} className="relative max-w-[320px] w-full">
      <input ref={inputRef} type="text" value={search} onChange={(e) => { setSearch(e.target.value); setHighlightIdx(0); }}
        onKeyDown={handleKeyDown}
        placeholder={t("searchPlaceholder")}
        className="w-full bg-iron-900 border-2 border-risk-blue/60 text-iron-100 rounded-lg px-3 py-1.5 text-xs font-semibold outline-none placeholder:text-iron-600 placeholder:font-normal
          shadow-[0_0_12px_rgba(59,130,246,0.15)]" />
      <div className="absolute top-full left-0 right-0 mt-1 bg-surface-secondary border border-iron-700 rounded-lg shadow-2xl shadow-black/40 overflow-hidden z-50 max-h-[240px] overflow-y-auto animate-in fade-in zoom-in-95 duration-150">
        {filtered.length === 0 ? (
          <div className="px-3 py-3 text-xs text-iron-500 italic text-center">Sin resultados</div>
        ) : (
          filtered.map(({ asset, originalIdx }, i) => {
            const isSelected = originalIdx === selectedIdx;
            const isHighlighted = i === highlightIdx;
            const alertCount = 0; // Could be wired to alertsByTarget if needed
            return (
              <button key={asset.id}
                onClick={() => { onSelect(originalIdx); setIsOpen(false); }}
                onMouseEnter={() => setHighlightIdx(i)}
                className={`w-full flex items-center gap-2 px-3 py-2 text-left text-xs transition-colors
                  ${isHighlighted ? 'bg-risk-blue/10 text-iron-50' : 'hover:bg-surface-tertiary/60 text-iron-300'}
                  ${isSelected ? 'border-l-2 border-risk-blue' : 'border-l-2 border-transparent'}`}>
                <span className="text-sm shrink-0">{asset.type === 'portfolio' ? '📁' : '📊'}</span>
                <span className="truncate flex-1 font-medium">{asset.name}</span>
                {isSelected && <span className="text-[9px] text-risk-blue font-bold shrink-0">●</span>}
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   MAIN: CENTRO DE ALERTAS
   ═══════════════════════════════════════════════════════════ */

export default function AlertsDrawer({
  isOpen, onClose, strategies, portfolios, initialTargetId, accountId
}: AlertsDrawerProps) {
  const t = useTranslations("alertsCenter");
  const locale = useLocale();
  const [allAlerts, setAllAlerts] = useState<AlertRule[]>([]);
  const [loading, setLoading] = useState(false);
  const [leftSearch, setLeftSearch] = useState("");
  const { getDef, ALERT_KEYS } = useMetrics();
  const [addingRuleId, setAddingRuleId] = useState<string | null>(null);
  const [savingRuleId, setSavingRuleId] = useState<string | null>(null);

  // Build unified asset list
  const assets: AssetOption[] = useMemo(() => {
    const list: AssetOption[] = strategies.map((s) => ({ id: s.id, name: s.name, type: "strategy" as const, data: s }));
    portfolios.forEach((p) => list.push({ id: p.id, name: p.name, type: "portfolio" as const, data: p }));
    return list;
  }, [strategies, portfolios]);

  // Currently selected asset for the right panel (new alert config)
  const [selectedIdx, setSelectedIdx] = useState(0);

  // Initialize selected index ONLY ONCE per drawer open session
  const initialLockRef = useRef(false);
  useEffect(() => {
    if (!isOpen) {
      initialLockRef.current = false;
    } else if (initialTargetId && !initialLockRef.current && assets.length > 0) {
      const idx = assets.findIndex((a) => a.id === initialTargetId);
      if (idx >= 0) {
        setSelectedIdx(idx);
        initialLockRef.current = true;
      }
    }
  }, [initialTargetId, assets, isOpen]);

  const selectedAsset = assets[selectedIdx] || assets[0];

  // Collapsed sections in left panel
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const toggleCollapse = (id: string) => setCollapsedSections(prev => {
    const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  // ── DATA FETCHING ──
  useEffect(() => {
    if (isOpen) fetchAllAlerts();
  }, [isOpen]);

  const fetchAllAlerts = async () => {
    setLoading(true);
    try {
      const res = await api.get("/api/alerts/user/all");
      setAllAlerts(res.data);
    } catch (e) { console.error(e); } finally { setLoading(false); }
  };

  // Group alerts by target_id
  const alertsByTarget = useMemo(() => {
    const map = new Map<string, AlertRule[]>();
    allAlerts.forEach((a) => {
      if (!map.has(a.target_id)) map.set(a.target_id, []);
      map.get(a.target_id)!.push(a);
    });
    return map;
  }, [allAlerts]);

  // Alerts for currently selected asset (right panel)
  const selectedAlertKeys = useMemo(() =>
    new Set((alertsByTarget.get(selectedAsset?.id) || []).map(a => a.metric_key)),
    [alertsByTarget, selectedAsset]
  );

  // ── MUTATIONS ──
  const handleAdd = useCallback(async (mKey: string, thresh: number, customCooldown?: number, customOp?: string) => {
    const def = getDef(mKey);
    // For account-level metrics (ea_disconnect), use accountId
    const target = mKey === "ea_disconnect_minutes" ? { type: "account", id: accountId } : (selectedAsset || assets[0]);
    if (!target) return;
    try {
      const res = await api.post("/api/alerts", {
        target_type: mKey === "ea_disconnect_minutes" ? "account" : target.type,
        target_id: target.id,
        metric_key: mKey, operator: customOp || def.defaultOperator || ">=", threshold_value: thresh, channel: "telegram",
        cooldown_minutes: customCooldown ?? def.defaultCooldown,
      });
      setAllAlerts(prev => {
        const exists = prev.find(a => a.metric_key === mKey && a.target_id === target.id);
        if (exists) {
            return prev.map(a => a.id === exists.id ? res.data : a);
        }
        return [...prev, res.data];
      });
    } catch (e) { console.error(e); }
  }, [selectedAsset, assets, accountId]);

  const handleUpdate = useCallback(async (id: string, newVal: number) => {
    try {
      const res = await api.patch(`/api/alerts/${id}`, { threshold_value: newVal });
      setAllAlerts(prev => prev.map(a => a.id === id ? res.data : a));
    } catch (e) { console.error(e); }
  }, []);

  const handleUpdateCooldown = useCallback(async (id: string, newVal: number) => {
    try {
      const res = await api.patch(`/api/alerts/${id}`, { cooldown_minutes: newVal });
      setAllAlerts(prev => prev.map(a => a.id === id ? res.data : a));
    } catch (e) { console.error(e); }
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await api.delete(`/api/alerts/${id}`);
      setAllAlerts(prev => prev.filter(x => x.id !== id));
    } catch (e) { console.error(e); }
  }, []);

  const handleDeleteAll = useCallback(async () => {
    try {
      if (window.confirm(t("deleteAllConfirm"))) {
        setLoading(true);
        await api.delete("/api/alerts/user/all");
        setAllAlerts([]);
      }
    } catch (e) {
      console.error(e);
      // Fallback
      for (const alert of allAlerts) {
        try { await api.delete(`/api/alerts/${alert.id}`); } catch {}
      }
      setAllAlerts([]);
    } finally {
      setLoading(false);
    }
  }, [allAlerts, t]);

  // ── NAVIGATION ──
  const goNext = () => setSelectedIdx(i => (i + 1) % assets.length);
  const goPrev = () => setSelectedIdx(i => (i - 1 + assets.length) % assets.length);

  if (!isOpen || assets.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-[4px]" onClick={onClose}>
      <div className="w-full h-full max-w-[1200px] max-h-[780px] m-4 bg-surface-secondary border border-iron-800/60
        rounded-2xl shadow-2xl shadow-black/40 flex flex-col overflow-hidden animate-in zoom-in-95 fade-in duration-200"
        onClick={(e) => e.stopPropagation()}>

        {/* ── HEADER ── */}
        <div className="flex items-center justify-between px-6 py-3.5 border-b border-iron-800/50 bg-gradient-to-r from-surface-tertiary to-surface-secondary shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-9 h-9 rounded-xl bg-risk-blue/15 border border-risk-blue/30 flex items-center justify-center text-xl shrink-0">🔔</span>
            <div className="min-w-0">
              <h2 className="text-base font-bold text-iron-50">{t("title")}</h2>
              <p className="text-[11px] text-iron-500 truncate">{t("subtitle")}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {allAlerts.length > 0 && (
              <div className="flex items-center bg-risk-green/15 border border-risk-green/30 rounded-full overflow-hidden">
                <span className="text-[10px] font-bold text-risk-green px-2.5 py-1 tabular-nums">
                  {allAlerts.length === 1 ? t("ruleCountOne") : t("ruleCountMany", { count: allAlerts.length })}
                </span>
                <button 
                  onClick={handleDeleteAll}
                  className="px-2.5 py-1 bg-risk-green/10 hover:bg-risk-red/30 text-risk-green hover:text-risk-red transition-all border-l border-risk-green/30 font-bold ml-0.5"
                  title={t("deleteAllTitle")}
                >
                  ✕
                </button>
              </div>
            )}
            <button onClick={onClose}
              className="w-8 h-8 rounded-lg bg-surface-tertiary border border-iron-700/50 text-iron-500 hover:text-white hover:border-iron-600 transition-all flex items-center justify-center text-sm">✕</button>
          </div>
        </div>

        {/* ── BODY ── */}
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <span className="inline-block w-6 h-6 border-2 border-iron-700 border-t-risk-blue rounded-full animate-spin" />
          </div>
        ) : (
          <div className="flex-1 grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-0 overflow-hidden">

            {/* ══ LEFT: All Active Rules + Telegram ══ */}
            <div className="flex flex-col border-r border-iron-800/40 overflow-y-auto">
              <div className="px-5 pt-4 pb-2 shrink-0 flex flex-col gap-3">
                <h3 className="text-[11px] font-bold text-iron-400 uppercase tracking-[0.15em] flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-risk-green animate-pulse" /> {t("activeRulesTitle")}
                </h3>
                
                <div className="relative">
                  <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-iron-500 text-xs">🔍</span>
                  <input 
                    type="text" 
                    placeholder={t("searchPlaceholder")}
                    value={leftSearch}
                    onChange={(e) => setLeftSearch(e.target.value)}
                    className="w-full bg-surface-primary border border-iron-800 focus:border-risk-blue rounded-md pl-7 pr-2 py-1 text-xs text-iron-200 outline-none transition-colors"
                  />
                </div>
              </div>

              <div className="px-5 pb-4 flex-1 space-y-1 mt-2">
                {assets.filter(a => a.name.toLowerCase().includes(leftSearch.toLowerCase())).map((asset) => {
                  const rules = alertsByTarget.get(asset.id) || [];
                  const isCollapsed = collapsedSections.has(asset.id);
                  const isPortfolio = asset.type === "portfolio";
                  return (
                    <div key={asset.id} className="rounded-lg overflow-hidden">
                      {/* Section header */}
                      <button onClick={() => toggleCollapse(asset.id)}
                        className={`w-full flex items-center gap-2 px-3 py-2 text-left transition-colors rounded-lg
                          ${selectedAsset?.id === asset.id ? 'bg-risk-blue/8 border border-risk-blue/20' : 'hover:bg-surface-tertiary/60 border border-transparent'}
                          ${rules.length === 0 ? 'opacity-60' : ''}`}>
                        <span className="text-[10px] text-iron-600 transition-transform duration-200"
                          style={{ transform: isCollapsed ? 'rotate(-90deg)' : 'rotate(0deg)' }}>▼</span>
                        <span className="text-xs">{isPortfolio ? '📁' : '📊'}</span>
                        <span className="text-xs font-semibold text-iron-200 truncate flex-1">{asset.name}</span>
                        {rules.length > 0 && (
                          <span className="text-[10px] font-bold bg-iron-800 text-iron-400 px-1.5 py-0.5 rounded-full tabular-nums">
                            {rules.length}
                          </span>
                        )}
                      </button>

                      {/* Rules */}
                      {!isCollapsed && rules.length > 0 && (
                        <div className="pl-4 pr-2 pb-1 space-y-1">
                          {rules.map((r) => {
                            const info = getDef(r.metric_key);
                            return (
                              <div key={r.id} className="flex items-center gap-1.5 py-1.5 px-2 rounded-md group/rule hover:bg-surface-tertiary/60 transition-colors">
                                <span className="text-sm shrink-0">{info.icon}</span>
                                <span className="text-[11px] text-iron-300 truncate flex-1">{locale === 'es' ? (info.labelEs || info.label) : info.label}</span>
                                <span className="text-[10px] text-iron-500 font-mono">{r.operator}</span>
                                <EditableValue alert={r} onSave={handleUpdate} />
                                <EditableCooldown alert={r} onSave={handleUpdateCooldown} />
                                <button onClick={() => handleDelete(r.id)}
                                  className="w-5 h-5 rounded flex items-center justify-center text-iron-700 opacity-0 group-hover/rule:opacity-100 hover:bg-risk-red/15 hover:text-risk-red transition-all"
                                  title={t("delete")}>
                                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                                  </svg>
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                      {!isCollapsed && rules.length === 0 && (
                        <p className="pl-10 pr-2 pb-2 text-[10px] text-iron-600 italic">{t("noAlerts")}</p>
                      )}
                    </div>
                  );
                })}
              </div>


              <div className="px-5 py-3 border-t border-iron-800/40 shrink-0">
                <h3 className="text-[11px] font-bold text-iron-400 uppercase tracking-[0.15em] flex items-center gap-2 mb-2">
                  <span>🖥️</span> {t("monitorEa")}
                </h3>
                <AccountHealthCard allAlerts={allAlerts} onAdd={handleAdd} onDelete={handleDelete} onUpdate={handleUpdate} />
              </div>

              <TelegramLinkSection onLinked={() => handleAdd("ea_disconnect_minutes", 5)} />
            </div>

            {/* ══ RIGHT: Strategy Navigator + Slider Cards ══ */}
            <div className="flex flex-col overflow-hidden">

              {/* Strategy navigator bar */}
              <div className="px-5 pt-4 pb-3 border-b border-iron-800/30 shrink-0">
                <div className="flex items-center gap-2">
                  <button onClick={goPrev}
                    className="w-8 h-8 rounded-lg bg-surface-tertiary border border-iron-700/50 text-iron-400 hover:text-white hover:border-iron-500 transition-all flex items-center justify-center text-sm font-bold active:scale-95">
                    ◀
                  </button>
                  <div className="flex-1 flex items-center justify-center gap-2 min-w-0">
                    <span className="text-sm">{selectedAsset?.type === 'portfolio' ? '📁' : '📊'}</span>
                    <SearchableAssetSelector
                      assets={assets}
                      selectedIdx={selectedIdx}
                      onSelect={(idx) => setSelectedIdx(idx)}
                    />
                    <span className="text-[10px] text-iron-600 font-mono tabular-nums whitespace-nowrap">
                      {selectedIdx + 1}/{assets.length}
                    </span>
                  </div>
                  <button onClick={goNext}
                    className="w-8 h-8 rounded-lg bg-surface-tertiary border border-iron-700/50 text-iron-400 hover:text-white hover:border-iron-500 transition-all flex items-center justify-center text-sm font-bold active:scale-95">
                    ▶
                  </button>
                </div>
              </div>

              {/* Slider cards */}
              <div className="flex-1 overflow-y-auto px-5 py-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {ALERT_KEYS.map((key) => {
                    const activeRule = (alertsByTarget.get(selectedAsset?.id || "") || []).find(r => r.metric_key === key);
                    return (
                      <SliderCard
                        key={`${selectedAsset?.id}-${key}`}
                        metricKey={key}
                        onAdd={handleAdd}
                        alreadyExists={!!activeRule}
                        activeRule={activeRule}
                        onUpdate={handleUpdate}
                        onUpdateCooldown={handleUpdateCooldown}
                        onDelete={handleDelete}
                        asset={selectedAsset}
                      />
                    );
                  })}
                </div>

                {/* Custom rule builder */}
                <div className="border-t border-iron-800/40 pt-4 mt-4">
                  <CustomRuleBuilder onAdd={handleAdd} />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════
   CUSTOM RULE BUILDER (extracted for cleanliness)
   ═══════════════════════════════════════════════════════════ */

function CustomRuleBuilder({ onAdd }: { onAdd: (key: string, val: number, cooldown?: number, op?: string) => Promise<void> }) {
  const t = useTranslations("alertsCenter");
  const locale = useLocale();
  const { getDef, ALERT_KEYS } = useMetrics();
  const [metric, setMetric] = useState("max_drawdown");
  const defaultCd = getDef("max_drawdown").defaultCooldown;
  const [threshold, setThreshold] = useState("");
  const [cooldown, setCooldown] = useState(defaultCd);
  const [operator, setOperator] = useState(getDef("max_drawdown").defaultOperator || ">=");
  
  // When metric changes, update the default cooldown if it was at the previous default
  useEffect(() => {
    const def = getDef(metric);
    setCooldown(def.defaultCooldown);
    setOperator(def.defaultOperator || ">=");
  }, [metric, getDef]);
  
  const submit = () => {
    if (threshold && Number(threshold) > 0) {
      onAdd(metric, Number(threshold), cooldown, operator);
      setThreshold("");
    }
  };

  return (
    <>
      <h4 className="text-[11px] font-bold text-iron-500 uppercase tracking-[0.12em] mb-3 flex items-center gap-2">
        <span>🛠</span> {t("customRuleHeader")}
      </h4>
      <div className="bg-surface-tertiary/60 border border-iron-700/40 rounded-xl p-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs text-iron-500 font-medium">{t("notifyIf")}</span>
          <select value={metric} onChange={(e) => setMetric(e.target.value)}
            className="bg-iron-900 border border-iron-700 text-iron-100 rounded-lg px-2.5 py-1.5 text-xs outline-none focus:border-risk-blue/50 transition-colors">
            {ALERT_KEYS.map((k) => { const d = getDef(k); return <option key={k} value={k}>{d.icon} {locale === 'es' ? (d.labelEs || d.label) : d.label}</option>; })}
          </select>
          <select value={operator} onChange={(e) => setOperator(e.target.value)}
            className="bg-iron-900 border border-iron-700 text-iron-100 rounded-lg px-2 py-1 text-xs font-mono outline-none focus:border-risk-blue/50 transition-colors">
            <option value=">=">≥</option>
            <option value="<=">≤</option>
            <option value=">">&gt;</option>
            <option value="<">&lt;</option>
            <option value="==">=</option>
          </select>
          <input type="number" value={threshold} onChange={(e) => setThreshold(e.target.value)} placeholder={t("valueLabel")}
            className="w-20 bg-iron-900 border border-iron-700 text-white rounded-lg px-2.5 py-1.5 text-xs font-mono outline-none focus:border-risk-blue/50 transition-colors placeholder:text-iron-600 placeholder:font-sans"
            min={0} step="any"
            onKeyDown={(e) => { if (e.key === "Enter") submit(); }} />
          <span className="text-[10px] text-iron-600 font-mono mr-2">{getDef(metric).unit}</span>
          
          <div className="flex items-center gap-1.5 ml-auto mr-3 bg-iron-900/60 px-2 py-1 rounded-lg border border-iron-800 overflow-visible">
            <span className="text-[10px] text-iron-500 group/label flex items-center gap-1 cursor-help relative">
              ⏱
              <div className="opacity-0 group-hover/label:opacity-100 absolute bottom-full right-0 mb-1 transition-opacity text-[10px] bg-iron-800 text-iron-200 border border-iron-700 p-2 rounded shadow-xl w-[200px] normal-case z-[60] pointer-events-none">
                {t("cooldownTooltip")}
              </div>
            </span>
            <input type="number" min={0} step={1} value={cooldown}
              onChange={(e) => setCooldown(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-12 bg-transparent text-iron-200 text-[10px] font-mono outline-none text-right" />
            <span className="text-[9px] text-iron-600">min</span>
          </div>

          <button onClick={submit}
            disabled={!threshold || Number(threshold) <= 0}
            className="bg-risk-blue/15 hover:bg-risk-blue/25 text-risk-blue border border-risk-blue/30 hover:border-risk-blue/50 px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-150 disabled:opacity-30 disabled:cursor-not-allowed active:scale-[0.98]">
            {t("btnCreate")}
          </button>
        </div>
      </div>
    </>
  );
}
