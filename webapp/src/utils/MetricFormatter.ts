export type MetricType = "integer" | "currency" | "decimal";

export class MetricFormatter {
  private formatRules: Map<string, MetricType>;

  constructor() {
    this.formatRules = new Map();
    this.registerDefaults();
  }

  private registerDefaults() {
    this.register("max_drawdown", "currency");
    this.register("daily_loss", "currency");
    this.register("consecutive_losses", "integer");
    this.register("stagnation_days", "integer");
    this.register("stagnation_trades", "integer");
    this.register("net_profit", "currency");
    this.register("total_trades", "integer");

    this.register("live_max_drawdown", "currency");
    this.register("live_daily_loss", "currency");
    this.register("live_consecutive_losses", "integer");
    this.register("live_stagnation_days", "integer");
    this.register("live_stagnation_trades", "integer");
  }

  public register(metricKey: string, type: MetricType) {
    this.formatRules.set(metricKey, type);
  }

  private formatWithSpaces(numStr: string): string {
    // Splits decimal and integer parts, applies space to thousands in integer part
    const parts = numStr.split('.');
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, " ");
    return parts.join('.');
  }

  public format(metricKey: string, value: number | undefined | null): string {
    if (value === undefined || value === null) return "—";

    const type = this.formatRules.get(metricKey) || "decimal";

    switch (type) {
      case "integer":
        return this.formatWithSpaces(Math.round(value).toString());
      case "currency":
        return `$${this.formatWithSpaces(value.toFixed(2))}`;
      case "decimal":
      default:
        return this.formatWithSpaces(value.toFixed(1));
    }
  }

  public getType(metricKey: string): MetricType {
    return this.formatRules.get(metricKey) || "decimal";
  }
}

// Singleton instance for the application
export const metricFormatter = new MetricFormatter();
