/**
 * VerdictConfig — Single Source of Truth for all risk verdict states.
 * 
 * Labels come from i18n JSON files via `useVerdictTranslations()`.
 * Colors and styling remain here (not locale-dependent).
 * 
 * Change a label? Edit es.json + en.json → changes everywhere.
 * Change a color? Edit here → changes everywhere.
 */

export type VerdictStatus = 'fatal' | 'red' | 'amber' | 'green';

export interface VerdictStyle {
  status: VerdictStatus;
  /** Emoji icon (universal, not translated) */
  icon: string;
  /** i18n key for label (e.g. "fatal_label") */
  labelKey: string;
  /** i18n key for description (e.g. "fatal_desc") */
  descKey: string;
  /** Tailwind text color class */
  textColor: string;
  /** Tailwind border color class */
  borderColor: string;
  /** Tailwind background class for the badge container */
  bgColor: string;
  /** Tailwind text color for the icon (may include animate) */
  iconClass: string;
  /** Tailwind text color for the label (may include animate) */
  labelClass: string;
}

const VERDICT_STYLES: Record<VerdictStatus, VerdictStyle> = {
  fatal: {
    status: 'fatal',
    icon: '🚫',
    labelKey: 'fatal_label',
    descKey: 'fatal_desc',
    textColor: 'text-iron-300',
    borderColor: 'border-iron-400/50',
    bgColor: 'bg-black border-red-600/60 shadow-[0_0_15px_rgba(220,38,38,0.5)]',
    iconClass: 'text-red-600 animate-pulse',
    labelClass: 'text-red-500 animate-pulse',
  },
  red: {
    status: 'red',
    icon: '🔴',
    labelKey: 'red_label',
    descKey: 'red_desc',
    textColor: 'text-red-400',
    borderColor: 'border-red-500/40',
    bgColor: 'bg-red-500/10 border-red-500/30',
    iconClass: 'text-red-500',
    labelClass: 'text-red-400',
  },
  amber: {
    status: 'amber',
    icon: '🟡',
    labelKey: 'amber_label',
    descKey: 'amber_desc',
    textColor: 'text-amber-400',
    borderColor: 'border-amber-500/40',
    bgColor: 'bg-amber-500/10 border-amber-500/30',
    iconClass: 'text-amber-500',
    labelClass: 'text-amber-400',
  },
  green: {
    status: 'green',
    icon: '🟢',
    labelKey: 'green_label',
    descKey: 'green_desc',
    textColor: 'text-emerald-400',
    borderColor: 'border-emerald-500/40',
    bgColor: 'bg-emerald-500/10 border-emerald-500/30',
    iconClass: 'text-emerald-500',
    labelClass: 'text-emerald-400',
  },
};

/** Fixed Bayesian thresholds (no longer user-configurable) */
export const BAYES_THRESHOLDS = {
  P_AMBER: 85,
  P_RED: 95,
} as const;

/**
 * Get the verdict style for a given status key.
 */
export function getVerdictStyle(status: VerdictStatus): VerdictStyle {
  return VERDICT_STYLES[status];
}

/**
 * Determine verdict status from a percentile value and terra incognita flag.
 */
export function getVerdictStyleFromPercentile(percentile: number | null, isTerraIncognita: boolean = false): VerdictStyle {
  if (percentile === null) return VERDICT_STYLES.green;
  if (isTerraIncognita) return VERDICT_STYLES.fatal;
  if (percentile >= BAYES_THRESHOLDS.P_RED) return VERDICT_STYLES.red;
  if (percentile >= BAYES_THRESHOLDS.P_AMBER) return VERDICT_STYLES.amber;
  return VERDICT_STYLES.green;
}

export default VERDICT_STYLES;
