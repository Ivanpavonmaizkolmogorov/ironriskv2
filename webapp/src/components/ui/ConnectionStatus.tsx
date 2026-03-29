"use client";

/**
 * ConnectionStatus — Dual-channel status indicator.
 * Shows both Server and EA connection health at a glance.
 */

import { useState, useEffect } from "react";
import { useTranslations } from "next-intl";
import { getConnectionMonitor, type DualSnapshot, type ChannelState } from "@/services/ConnectionMonitor";

function formatAge(seconds: number): string {
  if (seconds < 0)  return "never";
  if (seconds < 60)  return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

const DOT_STYLE: Record<ChannelState, { dot: string; text: string; label: string }> = {
  online:  { dot: "bg-risk-green", text: "text-risk-green/80", label: "Online" },
  stale:   { dot: "bg-amber-500",  text: "text-amber-400",     label: "Stale" },
  offline: { dot: "bg-risk-red",   text: "text-risk-red",      label: "Offline" },
};

function StatusDot({ state, pulse }: { state: ChannelState; pulse?: boolean }) {
  const s = DOT_STYLE[state];
  return (
    <span className="relative flex h-2 w-2">
      {(state !== "online" || pulse) && state !== "online" && (
        <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${s.dot} opacity-75`} />
      )}
      <span className={`relative inline-flex rounded-full h-2 w-2 ${s.dot}`} />
    </span>
  );
}

export default function ConnectionStatus() {
  const t = useTranslations("connection");
  
  const [snap, setSnap] = useState<DualSnapshot>({
    server: "online", ea: "offline",
    serverLastOk: null, eaLastHeartbeat: null, eaStaleSinceSeconds: -1,
  });

  // Force re-render every 10s to update "Xm ago" text
  const [, setTick] = useState(0);

  useEffect(() => {
    const monitor = getConnectionMonitor();
    monitor.start();
    const unsubscribe = monitor.subscribe(setSnap);
    const ticker = setInterval(() => setTick(t => t + 1), 10_000);
    return () => { unsubscribe(); monitor.stop(); clearInterval(ticker); };
  }, []);

  const serverStyle = DOT_STYLE[snap.server];
  const eaStyle     = DOT_STYLE[snap.ea];

  // Recalculate EA age on each render
  const eaAge = snap.eaLastHeartbeat
    ? Math.floor((Date.now() - snap.eaLastHeartbeat.getTime()) / 1000)
    : -1;

  const allGood = snap.server === "online" && snap.ea === "online";

  return (
    <div className={`fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-lg border backdrop-blur-sm shadow-lg transition-all duration-500 ${
      allGood
        ? "bg-risk-green/5 border-risk-green/15 px-3 py-1.5"
        : "bg-surface-secondary border-iron-700 px-4 py-2.5 shadow-2xl"
    }`}>
      {/* Server channel */}
      <div className="flex items-center gap-1.5">
        <StatusDot state={snap.server} />
        <span 
          className={`text-[10px] font-semibold uppercase tracking-wider border-b border-dashed border-iron-600/60 hover:border-iron-300 cursor-help select-none transition-colors ${serverStyle.text}`}
          title={t("api_tooltip")}
        >
          {t("api_label")}
        </span>
      </div>

      {/* Divider */}
      <div className="w-px h-3 bg-iron-700" />

      {/* EA channel */}
      <div className="flex items-center gap-1.5">
        <StatusDot state={snap.ea} />
        <span 
          className={`text-[10px] font-semibold uppercase tracking-wider border-b border-dashed border-iron-600/60 hover:border-iron-300 cursor-help select-none transition-colors ${eaStyle.text}`}
          title={t("ea_tooltip")}
        >
          {t("ea_label")}
        </span>
        {snap.ea !== "online" && eaAge >= 0 && (
          <span className="text-[9px] text-iron-500 font-mono">
            {formatAge(eaAge)}
          </span>
        )}
      </div>

      {/* Manual Refresh Action */}
      <div className="w-px h-3 bg-iron-700 ml-1" />
      <button
        onClick={() => window.location.reload()}
        className="text-iron-500 hover:text-white transition-colors p-1 rounded hover:bg-white/5 active:scale-95"
        title="Force Refresh Page"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
        </svg>
      </button>
    </div>
  );
}
