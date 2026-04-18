"use client";

import React from 'react';
import { useTranslations } from 'next-intl';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine, LineChart, Line, CartesianGrid } from 'recharts';
import MetricTooltip from '@/components/ui/MetricTooltip';
import { resolveBlindRisk } from "@/utils/blindRisk";

interface SimulateChartsProps {
  data: any; // Response from /api/simulate
}

const formatUsd = (val: number) => `$${val.toFixed(2)}`;
const formatPct = (val: number) => `${(val * 100).toFixed(1)}%`;

export default function SimulateCharts({ data }: SimulateChartsProps) {
  const t = useTranslations('simulate');
  
  if (!data) return null;

  const { decomposition, density_curve, equity_paths } = data;
  
  // Format density curve data
  const formattedDensity = density_curve.map((p: any) => ({
    x: p.x,
    density: p.density,
    positiveArea: p.is_positive ? p.density : 0,
    negativeArea: !p.is_positive ? p.density : 0,
  }));

  // Format equity paths for Recharts
  // Recharts wants array of objects: [{ trade: 1, path0: 10, path1: -5, ... }]
  const formattedPaths: any[] = [];
  if (equity_paths && equity_paths.length > 0) {
    const numTrades = equity_paths[0].length;
    for (let i = 0; i < numTrades; i++) {
      const row: any = { trade: i };
      equity_paths.forEach((path: number[], idx: number) => {
        row[`path${idx}`] = path[i];
      });
      formattedPaths.push(row);
    }
  }

  const pPositive = decomposition.p_positive;
  
  const { pct: blindPct, zone, style } = resolveBlindRisk(pPositive);

  // Survival Gauge styling (derived from zone)
  const gaugeColor = zone === 'critical' ? 'text-red-500' : zone === 'moderate' ? 'text-amber-500' : 'text-risk-green';
  const gaugeGlow = zone === 'critical' ? 'drop-shadow-[0_0_25px_rgba(239,68,68,0.5)]' : zone === 'moderate' ? 'drop-shadow-[0_0_25px_rgba(245,158,11,0.5)]' : 'drop-shadow-[0_0_25px_rgba(0,230,118,0.5)]';
  const gaugeMessage = zone === 'critical' ? t('gaugeMessageRed') : zone === 'moderate' ? t('gaugeMessageOrange') : t('gaugeMessageGreen');

  // Blind risk tier colors/messages
  const blindRiskColor = style.textColor;
  const blindRiskBorder = style.borderAccent || 'border-iron-800/20';
  const blindRiskBg = style.bgAccent || 'bg-iron-800/10';
  const blindRiskGlow = style.glowColor;
  const blindRiskMessage = zone === 'critical' ? t('blindRiskCritical') : zone === 'moderate' ? t('blindRiskMedium') : t('blindRiskLow');

  return (
    <div className="flex flex-col gap-6 w-full animate-in fade-in slide-in-from-bottom-8 duration-700">
      
      {/* 1. Master Gauge — Dual Framing */}
      <div className="flex flex-col items-center justify-center py-6 px-6 bg-surface-secondary border border-iron-800/50 rounded-2xl shadow-xl relative overflow-hidden">
        
        {/* Primary: Survival Probability — Validates the trader */}
        <h2 className="text-lg text-iron-400 font-medium mb-2">
          <MetricTooltip metricKey="survivalProbability" variant="chart">{t('gaugeTitle')}</MetricTooltip>
        </h2>
        <div className={`text-5xl md:text-6xl font-bold tracking-tighter ${gaugeColor} ${gaugeGlow} mb-1`}>
          {formatPct(pPositive)}
        </div>
        <p className="text-xs text-iron-400/80 mb-3 max-w-md text-center">
          {t('gaugeSubtitle')}
        </p>
        <p className={`text-sm md:text-[15px] font-medium max-w-2xl text-center leading-relaxed mb-5 ${pPositive < 0.5 ? 'text-red-400' : 'text-iron-300'}`}>
          {gaugeMessage}
        </p>

        {/* Divider */}
        <div className="w-full max-w-lg flex items-center gap-3 mb-5">
          <div className="flex-1 h-px bg-gradient-to-r from-transparent to-iron-700/50" />
          <span className="text-[10px] text-iron-600 uppercase tracking-widest font-bold">vs</span>
          <div className="flex-1 h-px bg-gradient-to-l from-transparent to-iron-700/50" />
        </div>

        {/* Secondary: Blind Risk — Creates urgency (Kahneman loss aversion) */}
        <div className={`w-full max-w-lg ${blindRiskBg} ${blindRiskBorder} border rounded-xl p-4 relative overflow-hidden transition-all duration-500`}>
          <div className={`absolute -top-8 -right-8 w-24 h-24 ${blindRiskGlow} blur-[40px] rounded-full pointer-events-none`} />
          
          <div className="flex items-center justify-between gap-4 relative z-10">
            <div className="flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <span className="text-lg">⚠️</span>
                <span className={`text-xs font-bold uppercase tracking-wider ${blindRiskColor}`}>
                  {t('blindRiskLabel')}
                </span>
              </div>
              <p className="text-[11px] text-iron-500 leading-relaxed max-w-xs">
                {blindRiskMessage}
              </p>
            </div>
            <div className="flex flex-col items-end">
              <span className={`text-3xl md:text-4xl font-bold tracking-tight ${blindRiskColor} drop-shadow-[0_0_15px_rgba(245,158,11,0.3)]`}>
                {formatPct(blindPct / 100)}
              </span>
              <span className="text-[10px] text-iron-600 mt-0.5">{t('blindRiskOf')} {t('blindRiskScenarios')}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 w-full">
        {/* 2. EV Distribution (Always Free) */}
        <div className="p-6 bg-surface-secondary border border-iron-800/50 rounded-2xl h-[280px] flex flex-col shadow-lg">
          <h3 className="text-lg font-bold text-iron-100 mb-4">
            <MetricTooltip metricKey="ev" variant="chart">{t('evDistribution')}</MetricTooltip>
          </h3>
          <div className="flex-1 w-full relative">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={formattedDensity} margin={{ top: 30, right: 10, left: 10, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorPos" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22c55e" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#22c55e" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorNeg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="x" tickFormatter={(val) => `$${val.toFixed(0)}`} type="number" scale="linear" domain={['dataMin', 'dataMax']} minTickGap={30} stroke="#525252" />
                <Tooltip 
                  formatter={(val: any, name: string) => [Number(val).toFixed(4), name]}
                  labelFormatter={(val) => `EV: $${Number(val).toFixed(2)}`}
                  contentStyle={{ backgroundColor: '#171717', borderColor: '#404040' }}
                />
                {/* $0 breakeven line — label always at the top */}
                <ReferenceLine 
                  x={0} 
                  stroke="#a3a3a3" 
                  strokeDasharray="3 3" 
                  label={(props: any) => {
                    const x0 = props.viewBox?.x ?? 0;
                    return (
                      <text x={x0} y={props.viewBox?.y - 16} fill="#a3a3a3" fontSize="11" fontWeight="bold" textAnchor="middle">
                        $0
                      </text>
                    );
                  }} 
                />
                {/* μ mean line — offset label when too close to $0 */}
                <ReferenceLine 
                  x={decomposition.ev_mean} 
                  stroke="#ffffff" 
                  strokeDasharray="5 3" 
                  label={(props: any) => {
                    const muX = props.viewBox?.x ?? 0;
                    // Detect if μ is close to $0 (within 60px) and offset
                    const dataRange = formattedDensity.length > 0 
                      ? Math.abs(formattedDensity[formattedDensity.length - 1].x - formattedDensity[0].x) 
                      : 1;
                    const isClose = Math.abs(decomposition.ev_mean) / dataRange < 0.12;
                    const isPositive = decomposition.ev_mean >= 0;
                    
                    // When close to $0: shift label away from the $0 label
                    const anchor = isClose ? (isPositive ? "start" : "end") : "middle";
                    const xOffset = isClose ? (isPositive ? 6 : -6) : 0;
                    
                    return (
                      <text 
                        x={muX + xOffset} 
                        y={props.viewBox?.y + (isClose ? -4 : 10)} 
                        fill="#ffffff" 
                        fontSize="12" 
                        fontWeight="bold" 
                        textAnchor={anchor}
                      >
                        μ = ${decomposition.ev_mean.toFixed(2)}
                      </text>
                    );
                  }} 
                />
                <Area type="monotone" dataKey="positiveArea" stroke="#22c55e" fillOpacity={1} fill="url(#colorPos)" isAnimationActive={true} />
                <Area type="monotone" dataKey="negativeArea" stroke="#ef4444" fillOpacity={1} fill="url(#colorNeg)" isAnimationActive={true} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* 3. Equity Paths (PaywallGated - admin can lock) */}
        <div className="p-6 bg-neutral-900/50 border border-neutral-800 rounded-2xl h-[280px] flex flex-col relative w-full">
          <h3 className="text-lg font-bold text-white mb-4 z-10">
            <MetricTooltip metricKey="equitySimulation" variant="chart">{t('equitySimulation')}</MetricTooltip>
          </h3>
          <div className="flex-1 w-full relative group">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={formattedPaths} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#262626" vertical={false} />
                  <XAxis dataKey="trade" stroke="#525252" tick={{fontSize: 12}} />
                  <YAxis stroke="#525252" tick={{fontSize: 12}} tickFormatter={(v) => `$${v}`} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#171717', borderColor: '#404040' }}
                    labelFormatter={(label) => `Trade ${label}`}
                  />
                  {equity_paths && equity_paths.map((_: any, idx: number) => (
                    <Line 
                      key={`path${idx}`} 
                      type="monotone" 
                      dataKey={`path${idx}`} 
                      stroke="#4b5563" 
                      strokeWidth={1} 
                      dot={false}
                      isAnimationActive={false}
                      activeDot={{ r: 4, fill: '#fff' }}
                    />
                  ))}
                  <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="5 5" />
                </LineChart>
              </ResponsiveContainer>
          </div>
        </div>
      </div>
      
    </div>
  );
}
