"use client";

import React, { useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
  ReferenceArea
} from "recharts";
import { useTranslations } from "next-intl";

interface InteractiveDistributionProps {
  chartData: {
    histogram: { x0: number; x1: number; height: number }[];
    curve: { x: number; y: number }[];
    current_value?: number | null;
    current_percentile?: number | null;
    distribution_name?: string;
    metric_name?: string;
    passed?: boolean;
    parameters?: Record<string, number>;
    is_hybrid?: boolean;
    hybrid_info?: {
      body_label: string;
      tail_label: string;
      splice_percentile: number;
      splice_value: number;
    };
  } | null;
  loading?: boolean;
}

export default function InteractiveDistribution({ chartData, loading }: InteractiveDistributionProps) {
  const t = useTranslations('charts.interactive');

  const mergedData = useMemo(() => {
    if (!chartData) return [];

    const result: any[] = [];

    // Precalculate total area of the curve for probability calculations
    let totalCurveArea = 0;
    for (let i = 1; i < chartData.curve.length; i++) {
        const p1 = chartData.curve[i - 1];
        const p2 = chartData.curve[i];
        if (Number.isFinite(p1.y) && Number.isFinite(p2.y)) {
            totalCurveArea += (p2.x - p1.x) * (p1.y + p2.y) / 2;
        }
    }

    // Map curve points and precompute right-tail cumulative probability
    let rightArea = totalCurveArea;
    chartData.curve.forEach((c, index) => {
      if (Number.isFinite(c.y) && Number.isFinite(c.x)) {
        if (index > 0) {
            const prev = chartData.curve[index - 1];
            rightArea -= (c.x - prev.x) * (prev.y + c.y) / 2;
        }
        let probRight = totalCurveArea > 0 ? (rightArea / totalCurveArea) * 100 : 0;
        // Float clamping to prevent -0.00
        if (probRight < 0) probRight = 0;
        if (probRight > 100) probRight = 100;
        result.push({ x: c.x, y: c.y, probRight });
      }
    });

    // Map histogram points
    let minX = Infinity;
    let maxX = -Infinity;

    if (chartData.histogram && chartData.histogram.length > 0) {
      chartData.histogram.forEach((b) => {
        const mid = (b.x0 + b.x1) / 2;
        const width = b.x1 - b.x0;
        if (Number.isFinite(b.height) && Number.isFinite(mid)) {
          result.push({ x: mid, barHeight: b.height, barWidth: width });
        }
        if (b.x0 < minX) minX = b.x0;
        if (b.x1 > maxX) maxX = b.x1;
      });
    }

    if (chartData.curve && chartData.curve.length > 0) {
      chartData.curve.forEach((c) => {
        if (c.x < minX) minX = c.x;
        if (c.x > maxX) maxX = c.x;
      });
    }

    if (chartData.current_value !== undefined && chartData.current_value !== null) {
      if (chartData.current_value < minX) minX = chartData.current_value;
      if (chartData.current_value > maxX) maxX = chartData.current_value;
    }

    if (minX !== Infinity && maxX !== -Infinity) {
       // Force domain boundaries into the dataset to guarantee ReferenceArea and ReferenceLine are never clipped by dataMin/dataMax
       if (!result.find(r => r.x === minX)) result.push({ x: minX, anchor: true });
       if (!result.find(r => r.x === maxX)) result.push({ x: maxX, anchor: true });
    }

    // Sort by X so Recharts doesn't glitch on continuous axis
    result.sort((a, b) => a.x - b.x);

    return result;
  }, [chartData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full w-full">
        <span className="text-xs text-iron-500 animate-pulse">{t('loading')}</span>
      </div>
    );
  }

  if (!chartData || mergedData.length === 0) {
    return (
      <div className="flex items-center justify-center h-full min-h-[200px] text-iron-600 text-sm">
        {t('noData')}
      </div>
    );
  }

  const { current_value, distribution_name, passed, current_percentile } = chartData;

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const xVal = Number(label);
      const curveVal = payload.find((p: any) => p.dataKey === "y")?.value;
      const probRight = payload.find((p: any) => p.payload.probRight !== undefined)?.payload.probRight;
      
      // Encontrar la barra del histograma donde cae X
      const activeBar = chartData.histogram.find(b => xVal >= b.x0 && xVal <= b.x1);
      const barVal = activeBar ? activeBar.height : null;

      // Calcular probabilidad empírica acumulada a la derecha
      let empiricalProbRight = 0;
      let totalEmpiricalArea = 0;
      chartData.histogram.forEach(b => {
        const binArea = b.height * (b.x1 - b.x0);
        totalEmpiricalArea += binArea;
        if (xVal <= b.x0) {
          empiricalProbRight += binArea;
        } else if (xVal > b.x0 && xVal < b.x1) {
          empiricalProbRight += b.height * (b.x1 - xVal);
        }
      });
      if (totalEmpiricalArea > 0) {
        empiricalProbRight = (empiricalProbRight / totalEmpiricalArea) * 100;
      }

      return (
        <div style={{
          backgroundColor: "var(--surface-elevated)",
          border: "1px solid var(--iron-800)",
          borderRadius: "8px",
          padding: "10px",
          color: "var(--iron-100)",
          fontSize: "12px",
          minWidth: "150px"
        }}>
          <p style={{ margin: 0, paddingBottom: "6px", borderBottom: "1px solid var(--iron-800)", marginBottom: "6px", color: "var(--iron-400)" }}>
            {t('value')}: <strong>{xVal.toFixed(2)}</strong>
            {activeBar && (
              <span style={{ display: "block", fontSize: "10px", marginTop: "2px", color: "var(--iron-500)" }}>
                {t('bin')}: [{activeBar.x0.toFixed(2)} - {activeBar.x1.toFixed(2)}]
              </span>
            )}
          </p>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {curveVal !== undefined && curveVal !== null && (
              <div style={{ display: "flex", justifyContent: "space-between", gap: "16px" }}>
                <span>{t('probDensity')}</span>
                <span style={{ color: "var(--risk-yellow)", fontWeight: 600 }}>{curveVal.toFixed(4)}</span>
              </div>
            )}
            {probRight !== undefined && probRight !== null && (
              <div style={{ display: "flex", justifyContent: "space-between", gap: "16px", borderBottom: "1px dashed var(--iron-800)", paddingBottom: "4px" }}>
                <span>{t('probWorseX')}</span>
                <span style={{ color: "var(--risk-red)", fontWeight: 600 }}>{probRight.toFixed(1)}%</span>
              </div>
            )}
            {barVal !== undefined && barVal !== null && (
              <div style={{ display: "flex", justifyContent: "space-between", gap: "16px" }}>
                <span>{t('empFreq')}</span>
                <span style={{ color: "var(--accent)", fontWeight: 600 }}>{barVal.toFixed(4)}</span>
              </div>
            )}
            {totalEmpiricalArea > 0 && (
              <div style={{ display: "flex", justifyContent: "space-between", gap: "16px" }}>
                <span>{t('empWorseX')}</span>
                <span style={{ color: "var(--iron-200)", fontWeight: 600 }}>{empiricalProbRight.toFixed(1)}%</span>
              </div>
            )}
          </div>
        </div>
      );
    }
    return null;
  };

  // Un render vacio para la barra, solo lo queremos para forzar que el YAxis contenga los topes de las alturas empíricas
  const DummyBar = () => null;

  return (
    <div className="w-full h-[280px] relative group text-sm">
      {/* Floating Labels to match Matplotlib style */}
      <div className="absolute top-2 right-2 flex flex-col items-end z-10 opactiy-90 pointer-events-none">
        {chartData.histogram.length > 0 && (
          <div className="flex items-center gap-1.5 bg-surface-elevated/80 border border-iron-800 rounded px-2 py-1 mb-1 backdrop-blur-sm">
            <div className="w-3 h-3 bg-accent opacity-60 border border-accent"></div>
            <span className="text-[9px] text-iron-400 font-medium">{t('empirical')}</span>
          </div>
        )}
        {passed && distribution_name && (
          <div className="flex items-center gap-1.5 bg-surface-elevated/80 border border-iron-800 rounded px-2 py-1 backdrop-blur-sm">
            <div className="w-4 h-0.5 bg-risk-yellow"></div>
            <span className="text-[9px] text-iron-400 font-medium">
              {chartData.is_hybrid && chartData.hybrid_info ? (
                <>
                  <span className="text-indicator text-risk-green">⚡</span>{' '}
                  {t('fit')} {chartData.hybrid_info.body_label} + {chartData.hybrid_info.tail_label}
                  <span className="text-iron-600 ml-1">
                    (splice@{chartData.hybrid_info.splice_percentile}%)
                  </span>
                </>
              ) : (
                <>
                  {t('fit')} {distribution_name}
                  {chartData.parameters && Object.keys(chartData.parameters).length > 0 && (
                    <span className="text-iron-500 ml-1">
                      ({Object.entries(chartData.parameters).map(([k, v]) => `${k}=${v.toFixed(2)}`).join(', ')})
                    </span>
                  )}
                </>
              )}
            </span>
          </div>
        )}
      </div>

      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={mergedData} margin={{ top: 20, right: 20, left: 10, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--iron-800)" />
          <XAxis 
            dataKey="x" 
            type="number" 
            domain={['dataMin', 'dataMax']} 
            tick={{ fill: "var(--iron-400)", fontSize: 10 }}
            axisLine={{ stroke: "var(--iron-700)" }}
            tickFormatter={(val) => typeof val === 'number' ? val.toFixed(1) : val}
          />
          <YAxis 
            domain={['auto', 'auto']}
            tick={{ fill: "var(--iron-400)", fontSize: 10 }}
            axisLine={{ stroke: "var(--iron-700)" }}
            tickFormatter={(val) => typeof val === 'number' ? val.toFixed(3) : val}
          />
          <Tooltip content={<CustomTooltip />} />
          
          {chartData.histogram.map((b, i) => (
            <ReferenceArea 
              key={`hist-${i}`} 
              x1={b.x0} 
              x2={b.x1} 
              y1={0} 
              y2={b.height} 
              fill="var(--accent)" 
              fillOpacity={0.4} 
              stroke="var(--accent)"
              strokeOpacity={0.8}
              strokeWidth={1}
              isFront={false}
            />
          ))}

          {/* Dummy Bar to force Y-Axis Domain calculation for empirical frequencies */}
          <Bar 
            dataKey="barHeight" 
            shape={<DummyBar />}
            isAnimationActive={false}
          />

          {/* Theoretical Curve */}
          <Area 
            type="monotone" 
            dataKey="y" 
            stroke="var(--risk-yellow)" 
            strokeWidth={2.5}
            fill="var(--risk-yellow)"
            fillOpacity={0.15}
            dot={false}
            activeDot={{ r: 4, fill: "var(--risk-yellow)", stroke: "var(--risk-yellow)" }}
            isAnimationActive={false}
            connectNulls={true}
          />

          {/* Current Live Value vertical line */}
          {current_value !== null && current_value !== undefined && (
             <ReferenceLine 
               x={current_value} 
               stroke="var(--risk-red)" 
               strokeDasharray="4 4"
               strokeWidth={2}
               label={{ 
                 position: 'top', 
                 value: `${t('current')}: ${current_value.toFixed(1)} ${current_percentile !== null && current_percentile !== undefined ? `(P${current_percentile})` : ''}`, 
                 fill: 'var(--risk-red)', 
                 fontSize: 10,
                 fontWeight: 'bold'
               }}
             />
          )}

        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
