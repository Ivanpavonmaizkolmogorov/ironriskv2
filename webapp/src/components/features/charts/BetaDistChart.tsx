import React, { useMemo } from "react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine } from "recharts";

// --- Log-Gamma (Lanczos approximation) for Beta PDF ---
export function logGamma(z: number): number {
  const g = 7;
  const c = [
    0.99999999999980993, 676.5203681218851, -1259.1392167224028,
    771.32342877765313, -176.61502916214059, 12.507343278686905,
    -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7
  ];
  if (z < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * z)) - logGamma(1 - z);
  z -= 1;
  let x = c[0];
  for (let i = 1; i < g + 2; i++) x += c[i] / (z + i);
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(x);
}

export function betaPdf(x: number, a: number, b: number): number {
  if (x <= 0 || x >= 1) return 0;
  const logB = logGamma(a) + logGamma(b) - logGamma(a + b);
  return Math.exp((a - 1) * Math.log(x) + (b - 1) * Math.log(1 - x) - logB);
}

interface BetaDistChartProps {
  priorA: number;
  priorB: number;
  postA: number;
  postB: number;
  icLower: number;
  icUpper: number;
}

export default function BetaDistChart({ priorA, priorB, postA, postB, icLower, icUpper }: BetaDistChartProps) {
  const data = useMemo(() => {
    const pts: { x: number; prior: number; posterior: number; ic: number | null }[] = [];
    for (let i = 1; i < 200; i++) {
      const x = i / 200;
      const postY = betaPdf(x, postA, postB);
      pts.push({
        x,
        prior: betaPdf(x, priorA, priorB),
        posterior: postY,
        ic: (x >= icLower && x <= icUpper) ? postY : null,
      });
    }
    return pts;
  }, [priorA, priorB, postA, postB, icLower, icUpper]);

  const priorMean = priorA / (priorA + priorB);
  const postMean = postA / (postA + postB);
  const delta = postMean - priorMean;
  const improved = delta > 0.001;
  const worsened = delta < -0.001;

  return (
    <div className="w-full mt-2">
      <div className="h-[160px]">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
            <XAxis dataKey="x" type="number" domain={[0, 1]} tick={{ fill: "#78828f", fontSize: 9 }}
              tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`} />
            <YAxis hide />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const x = payload[0]?.payload?.x;
                return (
                  <div className="bg-[#1e2228] border border-[#3e444f] rounded-lg px-3 py-2 text-[11px]">
                    <div className="text-iron-400">Win Rate: <span className="text-white font-mono">{(x * 100).toFixed(1)}%</span></div>
                    <div className="text-amber-400">Prior: <span className="font-mono">{payload[0]?.payload?.prior?.toFixed(3)}</span></div>
                    <div className="text-[#00aaff]">Posterior: <span className="font-mono">{payload[0]?.payload?.posterior?.toFixed(3)}</span></div>
                  </div>
                );
              }}
            />
            <Area type="monotone" dataKey="prior" stroke="#f59e0b" strokeWidth={1.5}
              strokeDasharray="4 3" fill="transparent" dot={false} isAnimationActive={false} />
            <Area type="monotone" dataKey="posterior" stroke="#00aaff" strokeWidth={2}
              fill="transparent" dot={false} isAnimationActive={false} />
            <Area type="monotone" dataKey="ic" stroke="none"
              fill="#10b981" fillOpacity={0.3} dot={false} isAnimationActive={false}
              connectNulls={false} />
            <ReferenceLine x={priorMean} stroke="#f59e0b" strokeDasharray="3 3" strokeWidth={1} />
            <ReferenceLine x={postMean} stroke="#00aaff" strokeWidth={1.5} />
            <ReferenceLine x={icLower} stroke="#10b981" strokeDasharray="2 2" strokeWidth={0.8} />
            <ReferenceLine x={icUpper} stroke="#10b981" strokeDasharray="2 2" strokeWidth={0.8} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div className="flex items-center justify-between mt-2">
        <div className="flex gap-3 text-[9px]">
          <span className="text-amber-400">--- Prior (solo BT)</span>
          <span className="text-[#00aaff]">— Posterior (BT + Live)</span>
          <span className="text-emerald-500">█ IC 95%</span>
        </div>
        <div className={`text-[11px] font-semibold flex items-center gap-1 ${
          improved ? "text-risk-green" : worsened ? "text-risk-red" : "text-iron-400"
        }`}>
          <span className="text-amber-400 font-mono text-[10px]">{(priorMean * 100).toFixed(1)}%</span>
          <span className="text-iron-500">{improved ? "→" : worsened ? "→" : "="}</span>
          <span className="text-[#00aaff] font-mono text-[10px]">{(postMean * 100).toFixed(1)}%</span>
          <span className={`ml-1 ${improved ? "text-risk-green" : worsened ? "text-risk-red" : "text-iron-500"}`}>
            {improved ? `▲ +${(delta * 100).toFixed(1)}pp` : worsened ? `▼ ${(delta * 100).toFixed(1)}pp` : "sin cambio"}
          </span>
          <span className="text-[10px]">
            {improved ? "✅ Mejorado" : worsened ? "⚠️ Empeorado" : "—"}
          </span>
        </div>
      </div>
    </div>
  );
}
