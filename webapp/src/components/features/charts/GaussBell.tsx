/** Gauss Bell chart — Recharts area chart showing PnL distribution. */
"use client";

import React, { useMemo } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  CartesianGrid,
} from "recharts";
import type { GaussParams } from "@/types/strategy";

interface GaussBellProps {
  params: GaussParams;
}

function gaussianPDF(x: number, mean: number, std: number): number {
  if (std === 0) return x === mean ? 1 : 0;
  const coeff = 1 / (std * Math.sqrt(2 * Math.PI));
  const exponent = -0.5 * ((x - mean) / std) ** 2;
  return coeff * Math.exp(exponent);
}

export default function GaussBell({ params }: GaussBellProps) {
  const data = useMemo(() => {
    const { mean, std } = params;
    if (std === 0) return [];
    const points = [];
    const range = 4 * std;
    const step = range / 80;
    for (let x = mean - range; x <= mean + range; x += step) {
      points.push({
        pnl: parseFloat(x.toFixed(2)),
        density: gaussianPDF(x, mean, std),
      });
    }
    return points;
  }, [params]);

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-iron-500 text-sm">
        Insufficient data for distribution
      </div>
    );
  }

  return (
    <div className="w-full h-72">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id="bellGradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#7c4dff" stopOpacity={0.4} />
              <stop offset="95%" stopColor="#7c4dff" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#2a2e35" />
          <XAxis
            dataKey="pnl"
            tick={{ fill: "#78828f", fontSize: 11 }}
            axisLine={{ stroke: "#3e444f" }}
            tickLine={false}
            tickFormatter={(v: number) => `$${v.toFixed(0)}`}
          />
          <YAxis hide />
          <Tooltip
            contentStyle={{
              backgroundColor: "#1e2228",
              border: "1px solid #3e444f",
              borderRadius: "8px",
              color: "#e1e4e8",
              fontSize: "12px",
            }}
            formatter={(value: number) => [value.toFixed(6), "Density"]}
            labelFormatter={(label: number) => `PnL: $${label}`}
          />
          <ReferenceLine x={params.mean} stroke="#00e676" strokeDasharray="5 5" label="" />
          <ReferenceLine x={0} stroke="#ff1744" strokeDasharray="3 3" label="" />
          <Area
            type="monotone"
            dataKey="density"
            stroke="#7c4dff"
            strokeWidth={2}
            fill="url(#bellGradient)"
            dot={false}
          />
        </AreaChart>
      </ResponsiveContainer>
      <div className="flex justify-center gap-6 mt-2 text-xs text-iron-400">
        <span>μ = <span className="text-risk-green font-mono">${params.mean.toFixed(2)}</span></span>
        <span>σ = <span className="text-iron-200 font-mono">${params.std.toFixed(2)}</span></span>
        <span>Skew = <span className="font-mono">{params.skewness.toFixed(3)}</span></span>
        <span>Kurt = <span className="font-mono">{params.kurtosis.toFixed(3)}</span></span>
      </div>
    </div>
  );
}
