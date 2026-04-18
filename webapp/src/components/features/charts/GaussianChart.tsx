import React, { useMemo } from "react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine } from "recharts";

export interface GaussianChartConfig {
  mean: number;
  std: number;
  lower: number;       // IC lower
  upper: number;       // IC upper
  label?: string;      // e.g. "E(X)", "W", "L"
  color?: string;      // accent color, default #00aaff
  fillColor?: string;  // IC fill, defaults to color
  zeroLine?: boolean;  // show zero reference line
  refLines?: { x: number; color: string; label?: string; dashed?: boolean; hideLegend?: boolean }[];
  format?: "usd" | "pct";
  height?: number;
  shadeAbove?: number; // shade area >= this x value (e.g. 0 for P(EV>0))
  shadeAboveColor?: string;
  shadeAboveLabel?: string;
  shadeBelow?: number; // shade area < this x value (e.g. 0 for loss zone)
  shadeBelowColor?: string;
  shadeBelowLabel?: string;
  hideIcFill?: boolean; // hide IC band fill (useful when shadeAbove/Below is active)
}

export function normalPdf(x: number, mu: number, sigma: number): number {
  const z = (x - mu) / sigma;
  return Math.exp(-0.5 * z * z) / (sigma * Math.sqrt(2 * Math.PI));
}

export default function GaussianChart({
  mean, std, lower, upper,
  label = "E(X)", color = "#00aaff", fillColor,
  zeroLine = true, refLines = [],
  format = "usd", height = 140,
  shadeAbove, shadeAboveColor = "#10b981", shadeAboveLabel,
  shadeBelow, shadeBelowColor = "#ef4444", shadeBelowLabel,
  hideIcFill = false,
}: GaussianChartConfig) {
  const fill = fillColor ?? color;
  const fmt = (v: number) => format === "pct" ? (v * 100).toFixed(1) + "%" : "$" + v.toFixed(2);

  const data = useMemo(() => {
    const lo = mean - 4 * std;
    const hi = mean + 4 * std;
    const pts: any[] = [];
    const n = 200;
    let accumulatedArea = 0;
    const step = (hi - lo) / n;
    
    for (let i = 0; i <= n; i++) {
      const x = lo + step * i;
      const y = normalPdf(x, mean, std);
      
      // Numerical integration for CDF
      accumulatedArea += y * step;
      
      pts.push({
        x: Math.round(x * 100) / 100,
        density: y,
        ic: (x >= lower && x <= upper) ? y : null,
        positive: (shadeAbove !== undefined && x >= shadeAbove) ? y : null,
        negative: (shadeBelow !== undefined && x < shadeBelow) ? y : null,
        probLeft: Math.min(accumulatedArea, 1), // Clamp to 1 just in case
      });
    }
    return pts;
  }, [mean, std, lower, upper, shadeAbove, shadeBelow]);

  const xMin = mean - 4 * std;
  const xMax = mean + 4 * std;
  const includesZero = lower <= 0 && upper >= 0;

  // Build explicit ticks for all key values
  const keyTicks = useMemo(() => {
    const ticks: number[] = [lower, mean, upper];
    if (zeroLine && 0 > xMin && 0 < xMax) ticks.push(0);
    refLines.forEach(r => { if (r.x > xMin && r.x < xMax) ticks.push(r.x); });
    // De-duplicate ticks that are too close (within 2% of range)
    const range = xMax - xMin;
    const minGap = range * 0.02;
    const sorted = [...new Set(ticks)].sort((a, b) => a - b);
    const filtered: number[] = [];
    for (const t of sorted) {
      if (filtered.length === 0 || Math.abs(t - filtered[filtered.length - 1]) > minGap) {
        filtered.push(t);
      }
    }
    return filtered;
  }, [lower, upper, mean, xMin, xMax, zeroLine, refLines]);

  return (
    <div className="w-full mt-1">
      <div style={{ height }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <XAxis dataKey="x" type="number" domain={[xMin, xMax]}
              ticks={keyTicks}
              tick={{ fill: "#78828f", fontSize: 9 }}
              tickFormatter={(v: number) => fmt(v)} />
            <YAxis hide />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0]?.payload;
                if (!p) return null;
                
                const probLeft = p.probLeft * 100;
                const probRight = Math.max(0, 100 - probLeft);
                
                return (
                  <div className="bg-[#1e2228] border border-[#3e444f] rounded-lg px-3 py-2 text-[11px] min-w-[140px]">
                    <div className="text-iron-400 border-b border-[#3e444f] pb-1 mb-1">{label}: <span className="text-white font-mono">{fmt(p.x)}</span></div>
                    <div className="flex justify-between items-center gap-3">
                      <span className="text-iron-500">P(Peor):</span>
                      <span className="font-mono text-risk-red">{probLeft.toFixed(1)}%</span>
                    </div>
                    <div className="flex justify-between items-center gap-3 mt-0.5">
                      <span className="text-iron-500">P(Mejor):</span>
                      <span className="font-mono text-risk-green">{probRight.toFixed(1)}%</span>
                    </div>
                  </div>
                );
              }}
            />
            <Area type="monotone" dataKey="density" stroke={color} strokeWidth={1.5}
              fill="transparent" dot={false} isAnimationActive={false} />
            {!hideIcFill && (
              <Area type="monotone" dataKey="ic" stroke="none"
                fill={fill} fillOpacity={0.25} dot={false} isAnimationActive={false}
                connectNulls={false} />
            )}
            {shadeAbove !== undefined && (
              <Area type="monotone" dataKey="positive" stroke="none"
                fill={shadeAboveColor} fillOpacity={0.35} dot={false} isAnimationActive={false}
                connectNulls={false} />
            )}
            {shadeBelow !== undefined && (
              <Area type="monotone" dataKey="negative" stroke="none"
                fill={shadeBelowColor} fillOpacity={0.2} dot={false} isAnimationActive={false}
                connectNulls={false} />
            )}
            {/* Zero line */}
            {zeroLine && (
              <ReferenceLine x={0} stroke={includesZero ? "#ef4444" : "#3e444f"} strokeWidth={includesZero ? 2 : 1}
                strokeDasharray={includesZero ? undefined : "3 3"} />
            )}
            {/* Mean line */}
            <ReferenceLine x={mean} stroke="#00ffaa" strokeWidth={1.5} />
            {/* Custom ref lines */}
            {refLines.map((r, i) => (
              <ReferenceLine key={i} x={r.x} stroke={r.color} strokeWidth={1.5}
                strokeDasharray={r.dashed ? "4 4" : undefined} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-start justify-between flex-wrap gap-2 mt-3 text-xs">
        <div className="flex flex-wrap items-center gap-4">
          <span style={{ color }}>— Distribución</span>
          {!hideIcFill && (
            <span style={{ color, opacity: 0.6 }}>█ IC [{fmt(lower)}, {fmt(upper)}]</span>
          )}
          {shadeAbove !== undefined && (
             <span style={{ color: shadeAboveColor }}>█ {shadeAboveLabel}</span>
          )}
          {shadeBelow !== undefined && (
             <span style={{ color: shadeBelowColor }}>█ {shadeBelowLabel}</span>
          )}
        </div>
        {refLines.filter(r => !r.hideLegend).map((r, i) => (
          <span key={i} style={{ color: r.color }} className="flex items-center gap-1">
            {r.dashed ? '---' : '—'} {r.label}
          </span>
        ))}
      </div>
    </div>
  );
}
