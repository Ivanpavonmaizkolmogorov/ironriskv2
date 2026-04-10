/**
 * metricsRegistry.ts — Single Source of Truth for all risk metric metadata.
 */

export interface MetricDef {
  key: string;
  icon: string;
  label: string;
  labelEs: string;
  unit: string;
  snapKey: string;
  tableLabel: string;
  tooltip: string;
  tooltipEs?: string;
  chartGuide: string;
  chartGuideEs?: string;
  defaultCooldown: number;
  defaultOperator?: string;
}

export const METRICS_REGISTRY_FALLBACK: Record<string, MetricDef> = {
  max_drawdown: {
    key: "max_drawdown",
    icon: "📉",
    label: "Max Drawdown",
    labelEs: "Max Drawdown",
    unit: "$",
    snapKey: "DrawdownMetric",
    tableLabel: "Max DD",
    tooltip: "The largest historical drop in capital from the highest peak to the lowest valley.",
    tooltipEs: "La mayor caída histórica de capital desde el pico más alto hasta el valle más bajo.",
    chartGuide: "The bell curve shows how likely the different drawdown depths are.",
    chartGuideEs: "La campana muestra qué tan probables son las diferentes profundidades de caída.",
    defaultCooldown: 0,
    defaultOperator: ">="
  },
  daily_loss: {
    key: "daily_loss",
    icon: "💸",
    label: "Daily Loss",
    labelEs: "Pérdida Diaria",
    unit: "$",
    snapKey: "DailyLossMetric",
    tableLabel: "Daily Loss",
    tooltip: "The maximum loss suffered over the course of a single trading day.",
    tooltipEs: "La máxima pérdida sufrida a lo largo de un solo día de negociación.",
    chartGuide: "Theoretical probability of hitting different daily loss ranges.",
    chartGuideEs: "Probabilidad teórica de alcanzar determinados rangos de pérdida diaria.",
    defaultCooldown: 0,
    defaultOperator: ">="
  },
  consecutive_losses: {
    key: "consecutive_losses",
    icon: "🔗",
    label: "Consecutive Losses",
    labelEs: "Rachas Perdedoras",
    unit: "ops",
    snapKey: "ConsecutiveLossesMetric",
    tableLabel: "Consec L.",
    tooltip: "The maximum number of consecutive losing trades in a row.",
    tooltipEs: "El número máximo de operaciones perdedoras hiladas de forma ininterrumpida.",
    chartGuide: "Risk of losing streaks.",
    chartGuideEs: "Riesgo de rachas perdedoras (Losing Streaks).",
    defaultCooldown: 0,
    defaultOperator: ">="
  },
  stagnation_days: {
    key: "stagnation_days",
    icon: "⏳",
    label: "Stagnation Days",
    labelEs: "Días Estancados",
    unit: "days",
    snapKey: "StagnationDaysMetric",
    tableLabel: "Stag Days",
    tooltip: "The longest period of time (in days) the strategy took to recover to a new all-time high.",
    tooltipEs: "El mayor periodo de tiempo (en días) que la estrategia ha tardado en recuperar un nuevo máximo histórico.",
    chartGuide: "The distribution predicts how many days capital is usually stagnant before recovering.",
    chartGuideEs: "La distribución predice cuántos días suele estar el capital estancado antes de remontar.",
    defaultCooldown: 0,
    defaultOperator: ">="
  },
  stagnation_trades: {
    key: "stagnation_trades",
    icon: "🔄",
    label: "Stagnation Trades",
    labelEs: "Ops. Estancadas",
    unit: "trades",
    snapKey: "StagnationTradesMetric",
    tableLabel: "Stag Trds",
    tooltip: "The maximum number of trades executed during a drawdown phase until achieving a new all-time high.",
    tooltipEs: "Número máximo de operaciones ejecutadas durante una fase de Drawdown hasta lograr un nuevo pico histórico.",
    chartGuide: "Reflects how many statistical 'shots' it takes on average to exit a slump.",
    chartGuideEs: "Refleja cuántos 'disparos' estadísticos cuesta en promedio salir de un bache.",
    defaultCooldown: 0,
    defaultOperator: ">="
  },
  ea_disconnect_minutes: {
    key: "ea_disconnect_minutes",
    icon: "🔌",
    label: "EA Disconnect",
    labelEs: "Desconexión EA",
    unit: "min",
    snapKey: "EADisconnectMetric",
    tableLabel: "EA Vital",
    tooltip: "Maximum Expert Advisor disconnection time before triggering the alert.",
    tooltipEs: "Tiempo máximo de desconexión del Expert Advisor antes de disparar la alerta.",
    chartGuide: "",
    chartGuideEs: "",
    defaultCooldown: 0,
  },
  ev: {
    key: "ev",
    icon: "📈",
    label: "Expectancy",
    labelEs: "Esperanza Ev",
    unit: "$",
    snapKey: "EVMetric",
    tableLabel: "Expectancy",
    tooltip: "Expected net profit per trade (as the fundamental pillar of Bayes' theorem).",
    tooltipEs: "Beneficio neto esperado por cada operación (como pilar base del teorema de Bayes).",
    chartGuide: "Mathematical edge per trade.",
    chartGuideEs: "Rendimiento matemático por operación.",
    defaultCooldown: 0,
    defaultOperator: "<="
  },
  guardian_status: {
    key: "guardian_status",
    icon: "🛡",
    label: "Guardian Level",
    labelEs: "Nivel Guardian",
    unit: "",
    snapKey: "GuardianMetric",
    tableLabel: "Guardian",
    tooltip: "Guardian level activated by MetaTrader.",
    tooltipEs: "Nivel del Guardian activado por MetaTrader.",
    chartGuide: "",
    chartGuideEs: "",
    defaultCooldown: 0,
  },
  margin_level: {
    key: "margin_level",
    icon: "⚖",
    label: "Margin Level",
    labelEs: "Nivel Margen",
    unit: "%",
    snapKey: "MarginMetric",
    tableLabel: "Margin Lvl",
    tooltip: "The free margin level of the account.",
    tooltipEs: "El nivel de margen libre de la cuenta.",
    chartGuide: "",
    chartGuideEs: "",
    defaultCooldown: 0,
  },
  bayes_blind_risk: {
    key: "bayes_blind_risk",
    icon: "🎯",
    label: "Blind Risk",
    labelEs: "Riesgo Ciego",
    unit: "%",
    snapKey: "",
    tableLabel: "Blind Risk",
    tooltip: "Probability that your statistical edge does not exist. 1 - P(Expectancy > 0). The higher this number, the more likely you are trading without a real advantage.",
    tooltipEs: "Probabilidad de que tu ventaja estadística no exista. 1 - P(Expectancy > 0). Cuanto mayor sea este número, más probable es que estés operando sin una ventaja real.",
    chartGuide: "",
    chartGuideEs: "",
    defaultCooldown: 60,
    defaultOperator: ">="
  }
};

export const ALERT_METRIC_KEYS = [
  "max_drawdown",
  "daily_loss",
  "consecutive_losses",
  "stagnation_days",
  "stagnation_trades",
  "bayes_blind_risk"
] as const;

export const RISK_METRIC_KEYS = [
  "max_drawdown",
  "daily_loss",
  "consecutive_losses",
  "stagnation_days",
  "stagnation_trades",
  "bayes_blind_risk"
] as const;

export function getMetricDef(key: string): MetricDef {
  return METRICS_REGISTRY_FALLBACK[key] || {
    key,
    icon: "🔹",
    label: key.replace(/_/g, " "),
    labelEs: key.replace(/_/g, " "),
    unit: "",
    snapKey: "",
    tableLabel: key,
    tooltip: "",
    tooltipEs: "",
    chartGuide: "",
    chartGuideEs: "",
    defaultCooldown: 0
  };
}
