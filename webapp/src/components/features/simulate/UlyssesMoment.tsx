"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { RiskSuggestions } from "@/store/useOnboardingStore";
import { metricFormatter } from "@/utils/MetricFormatter";
import { useMetrics } from "@/contexts/MetricsContext";

// ─── OOP Risk Metric Registry ───────────────────────────────────────
// Each metric is a self-describing object that knows how to extract
// its historical max from the suggestions and format it.
// Adding a 6th metric = adding one object here. Zero changes elsewhere.

type DataSource = "csv" | "manual";

interface UlyssesMetricDescriptor {
  /** Key matching RiskSuggestions field */
  key: keyof Omit<RiskSuggestions, "ev_per_trade" | "confidence_note">;

  /** Translation key for backtest (CSV) data */
  questionKeyBt: string;
  /** Translation key for Monte Carlo (manual) data */
  questionKeyMc: string;
  /** Formatter key for MetricFormatter */
  formatKey: string;
}

const ULYSSES_METRIC_REGISTRY: UlyssesMetricDescriptor[] = [
  {
    key: "max_drawdown",
    questionKeyBt: "ddQuestionBt",
    questionKeyMc: "ddQuestionMc",
    formatKey: "max_drawdown",
  },
  {
    key: "daily_loss",
    questionKeyBt: "dailyQuestionBt",
    questionKeyMc: "dailyQuestionMc",
    formatKey: "daily_loss",
  },
  {
    key: "consecutive_losses",
    questionKeyBt: "consecQuestionBt",
    questionKeyMc: "consecQuestionMc",
    formatKey: "consecutive_losses",
  },
  {
    key: "stagnation_days",
    questionKeyBt: "stagDaysQuestionBt",
    questionKeyMc: "stagDaysQuestionMc",
    formatKey: "stagnation_days",
  },
  {
    key: "stagnation_trades",
    questionKeyBt: "stagTradesQuestionBt",
    questionKeyMc: "stagTradesQuestionMc",
    formatKey: "stagnation_trades",
  },
];

// ─── Component ──────────────────────────────────────────────────────

interface UlyssesMomentProps {
  riskSuggestions: RiskSuggestions;
  /** Where the data comes from: 'csv' = real backtest, 'manual' = Monte Carlo projection */
  source: DataSource;
}

/**
 * UlyssesMoment — The emotional-educational bridge between simulation
 * results and the risk configuration panel.
 *
 * Adapts its narrative based on data source:
 * - CSV:    "Your backtest revealed..." (historical facts)
 * - Manual: "Monte Carlo projects..." (theoretical estimates)
 *
 * Uses the OOP registry to dynamically render only metrics that have data.
 */
export default function UlyssesMoment({ riskSuggestions, source }: UlyssesMomentProps) {
  const t = useTranslations("ulyssesMoment");
  const { getDef } = useMetrics();
  const isBt = source === "csv";

  // Filter metrics that have valid data (> 0)
  const activeMetrics = ULYSSES_METRIC_REGISTRY.filter((m) => {
    const value = riskSuggestions[m.key];
    return typeof value === "number" && value > 0;
  });

  // Don't render if no metrics have data
  if (activeMetrics.length === 0) return null;

  return (
    <div id="ulysses-moment" className="w-full mt-6 mb-2 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="relative border border-amber-500/30 bg-gradient-to-br from-amber-500/5 to-transparent rounded-2xl p-6 overflow-hidden">
        {/* Decorative glow */}
        <div className="absolute -top-12 -left-12 w-32 h-32 bg-amber-500/8 blur-[60px] rounded-full pointer-events-none" />

        {/* Header */}
        <div className="flex items-center gap-3 mb-4 relative z-10">
          <span className="text-2xl">⚖️</span>
          <h3 className="text-base font-bold text-amber-400 tracking-tight">
            {t("title")}
          </h3>
        </div>

        {/* Narrative text — adapts to source */}
        <p className="text-sm text-iron-300 leading-relaxed mb-5 relative z-10">
          {isBt ? t("descBt") : t("descMc")}
        </p>

        {/* Dynamic metric questions — from the OOP registry */}
        <div className="flex flex-col gap-2.5 mb-5 relative z-10">
          {activeMetrics.map((metric) => {
            const rawValue = riskSuggestions[metric.key] as number;
            const formatted = metricFormatter.format(metric.formatKey, rawValue);
            const questionKey = isBt ? metric.questionKeyBt : metric.questionKeyMc;
            return (
              <div
                key={metric.key}
                className="flex items-start gap-2.5 text-sm text-iron-200"
              >
                <span className="shrink-0 mt-0.5">{getDef(metric.key).icon}</span>
                <span>
                  {t(questionKey as any, { value: formatted })}
                </span>
              </div>
            );
          })}
        </div>

        {/* Cold moment footer */}
        <div className="flex flex-col gap-2 relative z-10">
          <p className="text-xs text-amber-500/80 font-semibold tracking-wide">
            ❄️ {t("coldMoment")}
          </p>
          <div className="flex items-center gap-2 text-[11px] text-iron-500 mt-1">
            <div className="flex-1 h-px bg-gradient-to-r from-amber-500/30 to-transparent" />
            <span className="shrink-0">▼ {t("configBelow")}</span>
            <div className="flex-1 h-px bg-gradient-to-l from-amber-500/30 to-transparent" />
          </div>
        </div>
      </div>
    </div>
  );
}
