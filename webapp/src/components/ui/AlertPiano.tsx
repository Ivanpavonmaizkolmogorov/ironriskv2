"use client";

import React, { useState } from "react";
import { Send, Mail, Loader2, CheckCircle2, XCircle, ChevronUp, ChevronDown } from "lucide-react";

interface AlertKey {
  id: string;
  label: string;
  icon: string;
  channel: "telegram" | "email";
  color: string;        // border/glow color class
  description: string;
}

const ALERTS: AlertKey[] = [
  // ── Acciones de Admin ──
  { id: "purge_history",    label: "Purge History",    icon: "🧹", channel: "telegram", color: "emerald", description: "Borrar candados de historial para testar alertas" },
  // ── Telegram ──
  { id: "morning_briefing", label: "Morning Briefing", icon: "🌅", channel: "telegram", color: "amber", description: "Resumen diario con estado de todos los nodos" },
  { id: "status",           label: "/status",          icon: "🖥️", channel: "telegram", color: "cyan", description: "Estado actual de los workspaces" },
  { id: "help",             label: "/help",            icon: "📌", channel: "telegram", color: "cyan", description: "Lista de comandos disponibles" },
  { id: "welcome",          label: "Welcome",          icon: "🛡️", channel: "telegram", color: "emerald", description: "Mensaje de bienvenida al vincular" },
  { id: "disconnect_warning", label: "Desconexión", icon: "🔴", channel: "telegram", color: "red", description: "Alerta de nodo sin señal 15min" },
  { id: "duplicate_warning", label: "Duplicado",    icon: "🚨", channel: "telegram", color: "orange", description: "Alerta de instalación duplicada" },
  { id: "transition",       label: "Transición",   icon: "🚦", channel: "telegram", color: "orange", description: "Alerta de Transición cualitativa de Riesgo" },
  { id: "ulises_drawdown",  label: "Ulises: Drawdown", icon: "📉", channel: "telegram", color: "red", description: "Pacto de Ulises: Exceso de Drawdown" },
  { id: "ulises_consec_losses", label: "Ulises: Pérdidas", icon: "🩸", channel: "telegram", color: "red", description: "Pacto de Ulises: Pérdidas Consecutivas" },
  { id: "ulises_margin",    label: "Ulises: Margen", icon: "⚠️", channel: "telegram", color: "red", description: "Pacto de Ulises: Nivel de Margen Crítico" },
  // ── Email ──
  { id: "welcome_email",   label: "Welcome Email",     icon: "✉️", channel: "email", color: "emerald", description: "Email de bienvenida a nuevo usuario" },
  { id: "password_reset",  label: "Password Reset",    icon: "🔑", channel: "email", color: "violet", description: "Email de restablecimiento de contraseña" },
  { id: "waitlist",        label: "Waitlist",           icon: "📋", channel: "email", color: "blue", description: "Confirmación de lista de espera" },
  { id: "beta_reactivation", label: "Beta Reactivation", icon: "🚀", channel: "email", color: "emerald", description: "Email de reactivación para leads de la waitlist" },
];

const colorMap: Record<string, { idle: string; hover: string }> = {
  amber:   { idle: "border-amber-500/30 text-amber-400",   hover: "hover:border-amber-400 hover:shadow-[0_0_12px_rgba(255,180,0,0.15)]" },
  cyan:    { idle: "border-cyan-500/30 text-cyan-400",     hover: "hover:border-cyan-400 hover:shadow-[0_0_12px_rgba(0,200,255,0.15)]" },
  emerald: { idle: "border-emerald-500/30 text-emerald-400", hover: "hover:border-emerald-400 hover:shadow-[0_0_12px_rgba(0,230,118,0.15)]" },
  red:     { idle: "border-red-500/30 text-red-400",       hover: "hover:border-red-400 hover:shadow-[0_0_12px_rgba(255,80,80,0.15)]" },
  orange:  { idle: "border-orange-500/30 text-orange-400", hover: "hover:border-orange-400 hover:shadow-[0_0_12px_rgba(255,140,0,0.15)]" },
  violet:  { idle: "border-violet-500/30 text-violet-400", hover: "hover:border-violet-400 hover:shadow-[0_0_12px_rgba(160,100,255,0.15)]" },
  blue:    { idle: "border-blue-500/30 text-blue-400",     hover: "hover:border-blue-400 hover:shadow-[0_0_12px_rgba(60,130,255,0.15)]" },
};

export default function AlertPiano({ apiBase }: { apiBase: string }) {
  const [expanded, setExpanded] = useState(false);
  const [firing, setFiring] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, "ok" | "error">>({});

  const fireAlert = async (alertId: string) => {
    setFiring(alertId);
    setResults((prev) => { const n = { ...prev }; delete n[alertId]; return n; });
    try {
      const isPurge = alertId === "purge_history";
      const url = isPurge 
        ? `${apiBase}/api/admin/purge_alert_history`
        : `${apiBase}/api/admin/trigger-alert?alert_type=${alertId}`;

      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${localStorage.getItem("ironrisk_jwt") || ""}`,
          "Content-Type": "application/json",
        },
      });
      setResults((prev) => ({ ...prev, [alertId]: res.ok ? "ok" : "error" }));
    } catch {
      setResults((prev) => ({ ...prev, [alertId]: "error" }));
    }
    setFiring(null);
    // Clear result after 4 seconds
    setTimeout(() => setResults((prev) => { const n = { ...prev }; delete n[alertId]; return n; }), 4000);
  };

  const telegramAlerts = ALERTS.filter((a) => a.channel === "telegram");
  const emailAlerts = ALERTS.filter((a) => a.channel === "email");

  return (
    <div className="relative">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 px-5 py-2.5 rounded-full shadow-2xl font-mono font-bold text-sm transition-all bg-surface-secondary text-iron-100 border border-amber-500/40 hover:text-white hover:border-amber-400 hover:shadow-[0_0_15px_rgba(255,180,0,0.2)]"
      >
        <Send className="w-4 h-4 text-amber-400" />
        Alert Piano
        {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
      </button>

      {expanded && (
        <div className="absolute bottom-full left-0 mb-2 w-[340px] bg-surface-secondary/95 backdrop-blur-lg border border-iron-700 rounded-xl shadow-2xl p-3 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <h3 className="text-[10px] font-bold text-iron-500 uppercase tracking-widest mb-2 px-1">
            🎹 Alert Piano — Test Notifications
          </h3>

          {/* Telegram Section */}
          <div className="mb-2">
            <div className="flex items-center gap-1.5 px-1 mb-1.5">
              <Send className="w-3 h-3 text-cyan-400" />
              <span className="text-[9px] font-bold text-cyan-400 uppercase tracking-wider">Telegram</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {telegramAlerts.map((alert) => {
                const c = colorMap[alert.color] || colorMap.cyan;
                const result = results[alert.id];
                const isLoading = firing === alert.id;
                return (
                  <button
                    key={alert.id}
                    onClick={() => fireAlert(alert.id)}
                    disabled={isLoading}
                    title={alert.description}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-semibold transition-all border bg-iron-900/60 disabled:opacity-50 ${
                      result === "ok"
                        ? "border-emerald-500/50 text-emerald-400"
                        : result === "error"
                        ? "border-red-500/50 text-red-400"
                        : `${c.idle} ${c.hover}`
                    }`}
                  >
                    {isLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                    ) : result === "ok" ? (
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    ) : result === "error" ? (
                      <XCircle className="w-3.5 h-3.5 shrink-0" />
                    ) : (
                      <span className="text-sm shrink-0">{alert.icon}</span>
                    )}
                    <span className="truncate">{alert.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Email Section */}
          <div>
            <div className="flex items-center gap-1.5 px-1 mb-1.5">
              <Mail className="w-3 h-3 text-violet-400" />
              <span className="text-[9px] font-bold text-violet-400 uppercase tracking-wider">Email</span>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              {emailAlerts.map((alert) => {
                const c = colorMap[alert.color] || colorMap.violet;
                const result = results[alert.id];
                const isLoading = firing === alert.id;
                return (
                  <button
                    key={alert.id}
                    onClick={() => fireAlert(alert.id)}
                    disabled={isLoading}
                    title={alert.description}
                    className={`flex items-center gap-2 px-3 py-2 rounded-lg text-[11px] font-semibold transition-all border bg-iron-900/60 disabled:opacity-50 ${
                      result === "ok"
                        ? "border-emerald-500/50 text-emerald-400"
                        : result === "error"
                        ? "border-red-500/50 text-red-400"
                        : `${c.idle} ${c.hover}`
                    }`}
                  >
                    {isLoading ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />
                    ) : result === "ok" ? (
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                    ) : result === "error" ? (
                      <XCircle className="w-3.5 h-3.5 shrink-0" />
                    ) : (
                      <span className="text-sm shrink-0">{alert.icon}</span>
                    )}
                    <span className="truncate">{alert.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
