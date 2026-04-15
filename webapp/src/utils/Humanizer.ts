/**
 * Humanizer — Transforms raw Bayesian metrics into human-readable narratives.
 *
 * Single source of truth for all narrative copy in the dashboard.
 * Components call humanizer methods; humanizer resolves i18n keys.
 *
 * - Does NOT contain UI logic (colors, CSS).
 * - Does NOT define thresholds (uses VerdictConfig for that).
 * - Does NOT replace info_report signals — complements them.
 *
 * Usage:
 *   const humanizer = new Humanizer(t);
 *   humanizer.verdictHeadline('red')      → "Your performance no longer matches..."
 *   humanizer.gaugeNarrative('max_drawdown', gauge) → "Your drawdown is more extreme than..."
 *   humanizer.blindRiskNarrative(34.2)    → "There is a significant probability..."
 */

import { type VerdictStatus } from './VerdictConfig';

export interface RiskGaugeData {
  current: number;
  percentile: number;
  status: string;
  limit?: number;
  simulated?: boolean;
}

type TranslationFn = (key: string, params?: Record<string, any>) => string;

/**
 * Blind Risk zones — derived from BAYES_THRESHOLDS to stay in sync.
 * These are the only thresholds the Humanizer needs.
 */
const BLIND_RISK_ZONES = {
  /** Below this → low risk narrative */
  LOW_CEILING: 20,
  /** Above this → critical risk narrative */
  CRITICAL_FLOOR: 50,
} as const;

export class Humanizer {
  /** Translation fn for the 'humanizer' namespace (gauge narratives, blind risk) */
  private tH: TranslationFn;
  /** Translation fn for the 'verdict' namespace (headline, guidance) */
  private tV: TranslationFn;

  constructor(tH: TranslationFn, tV: TranslationFn) {
    this.tH = tH;
    this.tV = tV;
  }

  // ──────────────────────────────────────────────
  // VERDICT — headline + guidance below the badge
  // ──────────────────────────────────────────────

  /** Human-readable headline for the verdict status (declarative, no verbs) */
  verdictHeadline(status: VerdictStatus): string {
    return this.tV(`${status}_human`);
  }

  /** Contextual guidance — what this state means, not what to do */
  verdictGuidance(status: VerdictStatus): string {
    return this.tV(`${status}_guidance`);
  }

  // ──────────────────────────────────────────────
  // RISK GAUGES — per-metric narratives
  // ──────────────────────────────────────────────

  /**
   * Generate a human phrase for a single risk gauge.
   * Uses i18n keys following the convention: humanizer.{metricKey}_{status}
   * Falls back to a generic phrase if the specific key doesn't exist.
   */
  gaugeNarrative(metricKey: string, gauge: RiskGaugeData): string {
    const status = gauge.status as VerdictStatus;
    // Try metric-specific key first (e.g. "max_drawdown_red")
    const specificKey = `${metricKey}_${status}`;
    return this.tH(specificKey, {
      current: gauge.current,
      pct: Math.round(gauge.percentile),
    });
  }

  /**
   * Generate the "What's happening" signal list.
   * Only returns signals for non-green gauges, sorted by severity.
   */
  whatIsHappening(gauges: Record<string, RiskGaugeData>): Array<{
    key: string;
    status: string;
    narrative: string;
    percentile: number;
  }> {
    const severityOrder: Record<string, number> = { fatal: 0, red: 1, amber: 2 };

    return Object.entries(gauges)
      .filter(([, g]) => g.status !== 'green')
      .map(([key, g]) => ({
        key,
        status: g.status,
        narrative: this.gaugeNarrative(key, g),
        percentile: g.percentile,
      }))
      .sort((a, b) => {
        // Sort by severity first, then by percentile descending
        const sevA = severityOrder[a.status] ?? 99;
        const sevB = severityOrder[b.status] ?? 99;
        if (sevA !== sevB) return sevA - sevB;
        return b.percentile - a.percentile;
      });
  }

  // ──────────────────────────────────────────────
  // BLIND RISK — the protagonist metric
  // ──────────────────────────────────────────────

  /** Determine Blind Risk zone from percentage */
  private blindRiskZone(blindRiskPct: number): 'low' | 'moderate' | 'critical' {
    if (blindRiskPct >= BLIND_RISK_ZONES.CRITICAL_FLOOR) return 'critical';
    if (blindRiskPct >= BLIND_RISK_ZONES.LOW_CEILING) return 'moderate';
    return 'low';
  }

  /** Narrative phrase for current Blind Risk level */
  blindRiskNarrative(blindRiskPct: number): string {
    const zone = this.blindRiskZone(blindRiskPct);
    return this.tH(`blindRisk_${zone}`, { pct: blindRiskPct.toFixed(1) });
  }

  /** Get Blind Risk zone info for UI styling decisions */
  blindRiskInfo(blindRiskPct: number): {
    zone: 'low' | 'moderate' | 'critical';
    narrative: string;
  } {
    const zone = this.blindRiskZone(blindRiskPct);
    return {
      zone,
      narrative: this.blindRiskNarrative(blindRiskPct),
    };
  }
}

export default Humanizer;
