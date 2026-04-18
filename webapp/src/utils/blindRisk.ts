/**
 * blindRisk.ts — Frontend mirror of BayesEngine thresholds.
 * 
 * If the mathematical model changes in the backend, update these thresholds
 * to match BayesEngine.BLIND_RISK_MODERATE / CRITICAL.
 */

// Synced with backend/services/stats/bayes_engine.py
export const BLIND_RISK_THRESHOLDS = {
  LOW_CEILING: 20,      // < 20% → low zone
  CRITICAL_FLOOR: 50,   // >= 50% → critical zone
} as const;

export function calcBlindRisk(pPositive: number): number {
  return (1 - pPositive) * 100;
}

export type BlindRiskZone = 'low' | 'moderate' | 'critical';

export function getBlindRiskZone(pct: number): BlindRiskZone {
  if (pct >= BLIND_RISK_THRESHOLDS.CRITICAL_FLOOR) return 'critical';
  if (pct >= BLIND_RISK_THRESHOLDS.LOW_CEILING) return 'moderate';
  return 'low';
}

export interface BlindRiskStyle {
  textColor: string;
  barGradient: string;
  bgAccent: string;
  borderAccent: string;
  glowColor: string;
  icon: string;
}

const ZONE_STYLES: Record<BlindRiskZone, BlindRiskStyle> = {
  low:      { textColor: 'text-risk-green', barGradient: 'bg-gradient-to-r from-emerald-600 to-emerald-400', bgAccent: '', borderAccent: '', glowColor: 'bg-emerald-500/8', icon: '⚪' },
  moderate: { textColor: 'text-amber-400',  barGradient: 'bg-gradient-to-r from-amber-600 to-amber-400',   bgAccent: 'bg-amber-500/5', borderAccent: 'border-amber-500/20', glowColor: 'bg-amber-500/8', icon: '🟡' },
  critical: { textColor: 'text-risk-red',   barGradient: 'bg-gradient-to-r from-red-700 to-red-500',       bgAccent: 'bg-red-500/5', borderAccent: 'border-red-500/20', glowColor: 'bg-red-500/10', icon: '🔴' },
};

export function getBlindRiskStyle(zone: BlindRiskZone): BlindRiskStyle {
  return ZONE_STYLES[zone];
}

/** All-in-one: from p_positive → pct, zone, and style */
export function resolveBlindRisk(pPositive: number) {
  const pct = calcBlindRisk(pPositive);
  const zone = getBlindRiskZone(pct);
  const style = getBlindRiskStyle(zone);
  return { pct, zone, style };
}
