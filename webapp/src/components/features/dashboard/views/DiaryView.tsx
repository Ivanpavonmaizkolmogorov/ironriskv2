"use client";

import React, { useState, useEffect, useMemo } from "react";
import { DashboardContext } from "../dashboardViewConfigs";
import { strategyAPI } from "@/services/api";
import type { Strategy } from "@/types/strategy";

// ── Note type ──────────────────────────────────────────────────────────────────

interface DiaryNote {
  date: string;
  type: "activated" | "paused" | "note";
  text: string;
}

interface RiskGauge {
  current: number;
  percentile: number;
  status: "green" | "amber" | "red" | "fatal";
  limit?: number;
}

interface BayesData {
  decomposition: { p_positive: number; blind_risk: number; ev_mean: number } | null;
  risk_gauges: Record<string, RiskGauge>;
  info_report?: { phase: string; signals: any[] };
  consistency_tests?: Record<string, { p_value: number; status: string }>;
  live_trades_total: number;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function noteIcon(type: DiaryNote["type"]) {
  return type === "activated" ? "▶️" : type === "paused" ? "⏸️" : "📝";
}

function noteLabel(type: DiaryNote["type"]) {
  return type === "activated" ? "ACTIVADA" : type === "paused" ? "PAUSADA" : "NOTA";
}

function noteLabelColor(type: DiaryNote["type"]) {
  return type === "activated"
    ? "text-emerald-400"
    : type === "paused"
    ? "text-amber-400"
    : "text-cyan-400";
}

function formatDate(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
  } catch {
    return iso;
  }
}

function formatTime(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

// ── Gauge label map ────────────────────────────────────────────────────────────

const GAUGE_LABELS: Record<string, string> = {
  max_drawdown: "Drawdown",
  daily_loss: "Daily Loss",
  stagnation_days: "Días estancado",
  stagnation_trades: "Trades estancado",
  consecutive_losses: "Rachas perdedoras",
};

// ── Context-aware suggestion generator ─────────────────────────────────────────

function generateSuggestions(bayes: BayesData | null, isForPause: boolean): string[] {
  if (!bayes) return [];
  const suggestions: string[] = [];
  const d = bayes.decomposition;

  if (isForPause) {
    // Blind risk
    if (d && d.p_positive < 0.5) {
      suggestions.push(`🔴 Riesgo Ciego ${((1 - d.p_positive) * 100).toFixed(0)}% — sin ventaja estadística`);
    } else if (d && d.p_positive < 0.7) {
      suggestions.push(`⚠️ Riesgo Ciego ${((1 - d.p_positive) * 100).toFixed(0)}% — ventaja débil`);
    }

    // Risk gauges in bad shape
    if (bayes.risk_gauges) {
      Object.entries(bayes.risk_gauges).forEach(([key, g]) => {
        const label = GAUGE_LABELS[key] || key;
        if (g.status === "fatal") {
          suggestions.push(`🚨 ${label} HALT — P${g.percentile.toFixed(0)} superó el límite`);
        } else if (g.status === "red") {
          suggestions.push(`🔴 ${label} en zona roja — P${g.percentile.toFixed(0)}`);
        } else if (g.status === "amber") {
          suggestions.push(`⚠️ ${label} en zona ámbar — P${g.percentile.toFixed(0)}`);
        }
      });
    }

    // Guardian consistency tests failing
    if (bayes.consistency_tests) {
      Object.entries(bayes.consistency_tests).forEach(([key, test]: [string, any]) => {
        if (test.status === "red" || test.status === "inconsistent") {
          suggestions.push(`🛡️ Guardian: ${key} inconsistente con backtest (p=${(test.p_value * 100).toFixed(1)}%)`);
        }
      });
    }

    // Phase
    if (bayes.info_report?.phase === "waiting") {
      suggestions.push("⏳ Sin datos live — esperando sincronización del EA");
    }

    // Generic if nothing else
    if (suggestions.length === 0) {
      suggestions.push("📊 Pausa preventiva — revisar rendimiento");
      suggestions.push("🔧 Mantenimiento — ajuste de parámetros");
    }
  } else {
    // For activation — positive signals
    if (d && d.p_positive >= 0.8) {
      suggestions.push(`✅ P(ventaja) ${(d.p_positive * 100).toFixed(0)}% — ventaja confirmada`);
    }

    // All gauges green
    const allGreen = bayes.risk_gauges && Object.values(bayes.risk_gauges).every((g: any) => g.status === "green");
    if (allGreen && Object.keys(bayes.risk_gauges).length > 0) {
      suggestions.push("🟢 Todas las métricas en zona verde");
    }

    if (suggestions.length === 0) {
      suggestions.push("▶️ Reactivación tras revisión");
    }
  }

  return suggestions;
}

// ── Main component ─────────────────────────────────────────────────────────────

export const DiaryView = ({ context }: { context: DashboardContext }) => {
  const { activeAsset, accountId, fetchStrategies: refreshStrategies } = context;

  const [noteText, setNoteText] = useState("");
  const [commentText, setCommentText] = useState("");
  const [selectedChips, setSelectedChips] = useState<Set<string>>(new Set());
  const [selectedNoteChips, setSelectedNoteChips] = useState<Set<string>>(new Set());
  const [showToggleConfirm, setShowToggleConfirm] = useState(false);
  const [loading, setLoading] = useState(false);
  const [bayesData, setBayesData] = useState<BayesData | null>(null);

  // ── Chip toggle helpers ──
  const toggleChip = (chip: string) => {
    setSelectedChips(prev => {
      const next = new Set(prev);
      if (next.has(chip)) next.delete(chip); else next.add(chip);
      const joined = Array.from(next).join(" | ");
      setCommentText(joined);
      return next;
    });
  };

  const toggleNoteChip = (chip: string) => {
    setSelectedNoteChips(prev => {
      const next = new Set(prev);
      if (next.has(chip)) next.delete(chip); else next.add(chip);
      const joined = Array.from(next).join(" | ");
      setNoteText(joined);
      return next;
    });
  };

  // ── Fetch Bayes data for the selected strategy ──
  const strategyId = activeAsset && !("strategy_ids" in activeAsset) ? activeAsset.id : null;

  useEffect(() => {
    if (!strategyId) { setBayesData(null); return; }
    strategyAPI.getBayes(strategyId, {})
      .then(r => setBayesData(r.data))
      .catch(() => setBayesData(null));
  }, [strategyId]);

  const isStrategy = activeAsset && !("strategy_ids" in activeAsset);
  const strategy = isStrategy ? (activeAsset as Strategy) : null;
  const isActive = strategy ? strategy.is_active !== false : true;
  const notes: DiaryNote[] = (strategy?.notes as DiaryNote[]) || [];

  // Generate context-aware suggestions
  const suggestions = useMemo(
    () => generateSuggestions(bayesData, isActive),
    [bayesData, isActive]
  );

  // Suggestions for notes
  const noteSuggestions = useMemo(() => {
    const chips: string[] = [];
    if (bayesData?.decomposition) {
      const d = bayesData.decomposition;
      chips.push(`Snapshot: P(ventaja)=${(d.p_positive * 100).toFixed(0)}%, EV=$${d.ev_mean.toFixed(2)}/trade`);
    }
    if (bayesData?.risk_gauges) {
      const worst = Object.entries(bayesData.risk_gauges)
        .filter(([, g]) => g.status === "red" || g.status === "fatal" || g.status === "amber")
        .map(([key, g]) => `${GAUGE_LABELS[key] || key} P${g.percentile.toFixed(0)}`)
        .join(", ");
      if (worst) chips.push(`⚠️ Alertas: ${worst}`);
    }
    return chips;
  }, [bayesData]);

  // ── No strategy selected ──
  if (!isStrategy || !strategy) {
    return (
      <div className="flex items-center justify-center h-48 text-iron-500 text-sm bg-surface-secondary/50 rounded-xl border border-iron-800/50">
        <div className="text-center space-y-1">
          <span className="text-2xl">📋</span>
          <p>Selecciona una estrategia abajo para ver su diario</p>
        </div>
      </div>
    );
  }

  // ── API calls ──

  const toggleStatus = async (newActive: boolean, comment: string) => {
    setLoading(true);
    try {
      await strategyAPI.toggleStatus(strategy.id, { is_active: newActive, comment });
      refreshStrategies(accountId);
    } catch (e) {
      console.error("Toggle failed:", e);
    } finally {
      setLoading(false);
      setShowToggleConfirm(false);
      setCommentText("");
    }
  };

  const addNote = async (text: string) => {
    if (!text.trim()) return;
    setLoading(true);
    try {
      await strategyAPI.addNote(strategy.id, { text: text.trim() });
      refreshStrategies(accountId);
      setNoteText("");
    } catch (e) {
      console.error("Add note failed:", e);
    } finally {
      setLoading(false);
    }
  };

  const deleteNote = async (index: number) => {
    setLoading(true);
    try {
      await strategyAPI.deleteNote(strategy.id, index);
      refreshStrategies(accountId);
    } catch (e) {
      console.error("Delete note failed:", e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 w-full">

      {/* ── ROW 1: Status card (left) + Add note (right) ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

        {/* LEFT — Status + Toggle */}
        <div className={`rounded-xl border p-4 flex flex-col gap-3 ${
          isActive
            ? "bg-surface-secondary border-iron-800/50"
            : "bg-amber-500/5 border-amber-500/20"
        }`}>
          {/* Header row */}
          <div className="flex items-center gap-3">
            <div className={`text-3xl ${loading ? "animate-pulse" : ""}`}>
              {isActive ? "▶️" : "⏸️"}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className={`font-bold text-base truncate ${isActive ? "text-iron-100" : "text-amber-300"}`}>
                {strategy.name}
              </h3>
              <p className={`text-xs font-semibold ${isActive ? "text-emerald-400" : "text-amber-400"}`}>
                {isActive ? "ACTIVA" : "PAUSADA"}
                <span className="text-iron-600 font-normal ml-2">M{strategy.magic_number}</span>
              </p>
            </div>
          </div>

          {/* Toggle button or confirmation */}
          {!showToggleConfirm ? (
            <button
              onClick={() => { setShowToggleConfirm(true); setCommentText(""); setSelectedChips(new Set()); }}
              disabled={loading}
              className={`w-full py-2 rounded-lg text-sm font-semibold transition-all ${
                isActive
                  ? "bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20"
                  : "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20"
              }`}
            >
              {isActive ? "⏸️ Pausar esta estrategia" : "▶️ Reactivar esta estrategia"}
            </button>
          ) : (
            <div className="flex flex-col gap-2">
              {/* Context-aware suggestion chips (multi-select) */}
              {suggestions.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {suggestions.map((s, i) => {
                    const isOn = selectedChips.has(s);
                    return (
                      <button
                        key={i}
                        onClick={() => toggleChip(s)}
                        className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-all border ${
                          isOn
                            ? "bg-iron-700 text-iron-100 border-iron-500 ring-1 ring-iron-500/50"
                            : "bg-iron-900 text-iron-400 border-iron-700/50 hover:border-iron-600 hover:text-iron-200"
                        }`}
                      >
                        {isOn && <span className="mr-1">✓</span>}{s}
                      </button>
                    );
                  })}
                </div>
              )}

              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") toggleStatus(!isActive, commentText);
                  if (e.key === "Escape") setShowToggleConfirm(false);
                }}
                placeholder={isActive ? "Motivo de pausa (opcional)..." : "Comentario (opcional)..."}
                className="w-full bg-iron-900 border border-iron-700 rounded-lg px-3 py-2 text-xs text-iron-200 placeholder-iron-600 focus:outline-none focus:border-iron-500"
                autoFocus
              />
              <div className="flex gap-2">
                <button
                  onClick={() => toggleStatus(!isActive, commentText)}
                  disabled={loading}
                  className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                    isActive
                      ? "bg-amber-500 text-black hover:bg-amber-400"
                      : "bg-emerald-500 text-black hover:bg-emerald-400"
                  }`}
                >
                  {loading ? "..." : isActive ? "⏸️ Confirmar pausa" : "▶️ Confirmar activación"}
                </button>
                <button
                  onClick={() => setShowToggleConfirm(false)}
                  className="px-4 py-2 rounded-lg text-xs text-iron-500 hover:text-iron-300 bg-iron-800 hover:bg-iron-700 transition-all"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}

          {/* Last status change */}
          {notes.length > 0 && (notes[0].type === "activated" || notes[0].type === "paused") && (
            <p className="text-[10px] text-iron-600 italic">
              Último cambio: {formatDate(notes[0].date)} a las {formatTime(notes[0].date)}
              {notes[0].text ? ` — "${notes[0].text}"` : ""}
            </p>
          )}
        </div>

        {/* RIGHT — Quick note input */}
        <div className="bg-surface-secondary border border-iron-800/50 rounded-xl p-4 flex flex-col gap-3">
          <div>
            <h4 className="text-iron-200 font-semibold text-sm">📝 Añadir nota</h4>
            <p className="text-iron-600 text-[10px] mt-0.5">
              Anota cualquier observación sobre esta estrategia
            </p>
          </div>

          {/* Context-aware note suggestion chips (multi-select) */}
          {noteSuggestions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {noteSuggestions.map((s, i) => {
                const isOn = selectedNoteChips.has(s);
                return (
                  <button
                    key={i}
                    onClick={() => toggleNoteChip(s)}
                    className={`px-2.5 py-1 rounded-full text-[10px] font-medium transition-all border ${
                      isOn
                        ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/30 ring-1 ring-cyan-500/30"
                        : "bg-iron-900 text-iron-400 border-iron-700/50 hover:border-cyan-500/30 hover:text-cyan-300"
                    }`}
                  >
                    {isOn && <span className="mr-1">✓</span>}{s}
                  </button>
                );
              })}
            </div>
          )}

          <textarea
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                addNote(noteText);
              }
            }}
            placeholder="Ej: Se la paso a Dani junto con ScalperEUR..."
            rows={3}
            className="w-full bg-iron-900 border border-iron-700 rounded-lg px-3 py-2 text-xs text-iron-200 placeholder-iron-600 focus:outline-none focus:border-cyan-500/50 resize-none"
          />

          <button
            onClick={() => addNote(noteText)}
            disabled={loading || !noteText.trim()}
            className="w-full py-2 rounded-lg text-xs font-semibold bg-cyan-500/15 text-cyan-300 hover:bg-cyan-500/25 border border-cyan-500/20 disabled:opacity-30 transition-all"
          >
            📝 Guardar nota
          </button>
        </div>
      </div>

      {/* ── ROW 2: Notes timeline ── */}
      <div className="bg-surface-secondary border border-iron-800/50 rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="text-iron-300 font-semibold text-sm">Historial</h4>
          <span className="text-iron-600 text-[10px]">{notes.length} {notes.length === 1 ? "entrada" : "entradas"}</span>
        </div>

        {notes.length > 0 ? (
          <div className="space-y-0.5">
            {notes.map((note, i) => (
              <div
                key={i}
                className="flex items-start gap-3 group px-3 py-2.5 rounded-lg hover:bg-iron-800/30 transition-colors"
              >
                {/* Timeline dot */}
                <div className="flex flex-col items-center shrink-0 mt-1">
                  <span className="text-sm">{noteIcon(note.type)}</span>
                  {i < notes.length - 1 && (
                    <div className="w-px h-full bg-iron-800 mt-1 min-h-[16px]" />
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className={`text-[10px] font-bold uppercase tracking-wider ${noteLabelColor(note.type)}`}>
                      {noteLabel(note.type)}
                    </span>
                    <span className="text-[10px] text-iron-600 font-mono">
                      {formatDate(note.date)} · {formatTime(note.date)}
                    </span>
                  </div>
                  {note.text && (
                    <p className="text-xs text-iron-300 leading-relaxed">
                      {note.text}
                    </p>
                  )}
                </div>

                {/* Delete */}
                <button
                  onClick={() => deleteNote(i)}
                  className="opacity-0 group-hover:opacity-100 text-iron-600 hover:text-red-400 transition-all shrink-0 mt-1 text-xs"
                  title="Eliminar"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center py-8 text-iron-600">
            <span className="text-3xl mb-2">📋</span>
            <p className="text-xs">Sin historial todavía</p>
            <p className="text-[10px] text-iron-700 mt-0.5">Las acciones y notas aparecerán aquí</p>
          </div>
        )}
      </div>
    </div>
  );
};
