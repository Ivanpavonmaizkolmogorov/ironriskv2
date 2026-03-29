export interface MetricDef {
  key: string;
  label: string;
  tableLabel: string;
  tooltip: string;
  chartGuide: string;
}

export const METRICS_REGISTRY: Record<string, MetricDef> = {
  max_drawdown: {
    key: "max_drawdown",
    label: "Maximum Drawdown",
    tableLabel: "Max DD",
    tooltip: "La mayor caída histórica de capital desde el pico más alto hasta el valle más bajo.",
    chartGuide: "La campana muestra qué tan probables son las diferentes profundidades de caída. Si la barra actual está a la derecha de la curva, el robot se encuentra en territorio estadísticamente inexplorado."
  },
  ev: {
    key: "ev",
    label: "Expectancy",
    tableLabel: "Expectancy",
    tooltip: "Beneficio medio esperado por cada operación terminada (Beneficio Neto / Total de Operaciones).",
    chartGuide: "Rendimiento matemático por operación. No posee modelo de distribución Weibull en esta vista."
  },
  daily_loss: {
    key: "daily_loss",
    label: "Daily Loss",
    tableLabel: "Daily Loss",
    tooltip: "La máxima pérdida sufrida a lo largo de un solo día de negociación.",
    chartGuide: "Probabilidad teórica de alcanzar determinados rangos de pérdida diaria. Vital para ajustar los límites de Drawdown Diario en pruebas de fondeo (Prop Firms)."
  },
  stagnation_days: {
    key: "stagnation_days",
    label: "Stag. Days",
    tableLabel: "Stag Days",
    tooltip: "El mayor periodo de tiempo (en días) que la estrategia ha tardado en recuperar un nuevo máximo histórico de beneficios.",
    chartGuide: "La distribución predice cuántos días suele estar el capital estancado antes de remontar. Colas muy largas implican meses en Drawdown temporal."
  },
  stagnation_trades: {
    key: "stagnation_trades",
    label: "Stag. Trades",
    tableLabel: "Stag Trds",
    tooltip: "Número máximo de operaciones ejecutadas durante una fase de Drawdown hasta lograr un nuevo pico histórico.",
    chartGuide: "Refleja cuántos 'disparos' estadísticos cuesta en promedio salir de un bache. Ayuda a distinguir si la estrategia está rota o si solo necesita operar más."
  },
  consecutive_losses: {
    key: "consecutive_losses",
    label: "Consecutive Losses",
    tableLabel: "Consec L.",
    tooltip: "El número máximo de operaciones perdedoras hiladas de forma ininterrumpida.",
    chartGuide: "Riesgo de rachas de perdedoras (Losing Streaks). El modelo estima la probabilidad de sufrir N pérdidas seguidas, algo crucial para no quemar la cuenta."
  }
};
