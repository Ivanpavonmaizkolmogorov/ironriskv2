/** Equity Curve chart — Recharts line chart with clinical dark styling. */
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

interface EquityCurveProps {
  data: EquityPoint[];
}

export default function EquityCurve({ data }: EquityCurveProps) {
  if (!data || data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-iron-500 text-sm">
        No equity data available
      </div>
    );
  }

  return (
    <div className="w-full h-72">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="equityGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#00e676" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#00e676" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a2e35" />
          <XAxis
            dataKey="trade"
            tick={{ fill: "#78828f", fontSize: 11 }}
            axisLine={{ stroke: "#3e444f" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "#78828f", fontSize: 11 }}
            axisLine={{ stroke: "#3e444f" }}
            tickLine={false}
            tickFormatter={(v: number) => `$${v.toFixed(0)}`}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1e2228",
              border: "1px solid #3e444f",
              borderRadius: "8px",
              color: "#e1e4e8",
              fontSize: "12px",
            }}
            formatter={(value: number) => [`$${value.toFixed(2)}`, "Equity"]}
            labelFormatter={(label: number) => `Trade #${label}`}
          />
          <Area
            type="monotone"
            dataKey="equity"
            stroke="#00e676"
            strokeWidth={2}
            fill="url(#equityGradient)"
            dot={false}
            activeDot={{ r: 4, fill: "#00e676" }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
