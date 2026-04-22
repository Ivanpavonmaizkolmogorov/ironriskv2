/** Equity Curve chart — Recharts line chart with clinical dark styling.
 * Supports two variants: 'backtest' (green) and 'live' (cyan).
 */
"use client";

import React from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import type { EquityPoint } from "@/types/strategy";
import { metricFormatter } from "@/utils/MetricFormatter";

/** Theme configuration for each variant — OOP-style config object. */
const VARIANT_THEMES = {
  backtest: {
    color: "#00e676",
    gradientId: "equityGradient",
    label: "Equity (Backtest)",
    gradientOpacity: 0.3,
  },
  live: {
    color: "#00b0ff",
    gradientId: "liveEquityGradient",
    label: "Equity (Live)",
    gradientOpacity: 0.2,
  },
} as const;

type EquityVariant = keyof typeof VARIANT_THEMES;

interface EquityCurveProps {
  data: EquityPoint[];
  variant?: EquityVariant;
  hideAxes?: boolean;
  hideTooltip?: boolean;
  syncId?: string;
  yAxisWidth?: number;
}

export default function EquityCurve({ data, variant = "backtest", hideAxes = false, hideTooltip = false, syncId, yAxisWidth }: EquityCurveProps) {
  const theme = VARIANT_THEMES[variant];

  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-iron-500 text-sm">
        No equity data available
      </div>
    );
  }

  const hasDates = data.some((d) => !!d.date);
  const xKey = hasDates ? "date" : "trade";

  // Pre-calculate PnL for each trade step
  const chartData = data.map((d, index) => {
    const previousEquity = index > 0 ? data[index - 1].equity : 0;
    return {
      ...d,
      pnl: d.equity - previousEquity
    };
  });

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const point = payload[0].payload;
      const isWin = point.pnl >= 0;
      return (
        <div style={{
          backgroundColor: "#1e2228",
          border: "1px solid #3e444f",
          borderRadius: "8px",
          padding: "10px",
          color: "#e1e4e8",
          fontSize: "12px",
          whiteSpace: "nowrap"
        }}>
          <p style={{ margin: 0, paddingBottom: "6px", borderBottom: "1px solid #2a2e35", marginBottom: "6px", color: "#78828f" }}>
            {hasDates ? `Date: ${label}` : `Trade #${label}`}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
              <span>{theme.label}</span>
              <span style={{ color: theme.color, fontWeight: 600 }}>
                {metricFormatter.format("net_profit", point.equity)}
              </span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", gap: "12px" }}>
              <span>Trade PnL</span>
              <span style={{ color: isWin ? "#00e676" : "#ff5252", fontWeight: 600 }}>
                {isWin ? "+" : "-"}{metricFormatter.format("net_profit", Math.abs(point.pnl))}
              </span>
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="w-full h-48">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }} syncId={syncId}>
          <defs>
            <linearGradient id={theme.gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={theme.color} stopOpacity={theme.gradientOpacity} />
              <stop offset="95%" stopColor={theme.color} stopOpacity={0} />
            </linearGradient>
          </defs>
          {!hideAxes && <CartesianGrid strokeDasharray="3 3" stroke="#2a2e35" />}
          {!hideAxes && (
            <XAxis
              dataKey={xKey}
              tick={{ fill: "#78828f", fontSize: 11 }}
              axisLine={{ stroke: "#3e444f" }}
              tickLine={false}
            />
          )}
          {!hideAxes && (
            <YAxis
              width={yAxisWidth ?? 60}
              tick={{ fill: "#78828f", fontSize: 11 }}
              axisLine={{ stroke: "#3e444f" }}
              tickLine={false}
              tickFormatter={(v: number) => metricFormatter.format("net_profit", v)}
            />
          )}
          {!hideTooltip && <Tooltip content={<CustomTooltip />} offset={20} />}
          <Area
            type="monotone"
            dataKey="equity"
            stroke={theme.color}
            strokeWidth={2}
            fill={`url(#${theme.gradientId})`}
            dot={false}
            activeDot={{ r: 4, fill: theme.color }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
