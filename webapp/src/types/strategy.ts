/** Strategy types matching the Python backend schemas. */

export interface Strategy {
  id: string;
  trading_account_id: string;
  name: string;
  description: string;
  magic_number: number;
  start_date: string | null;
  max_drawdown_limit: number;
  daily_loss_limit: number;
  total_trades: number;
  net_profit: number;
  equity_curve: EquityPoint[] | null;
  gauss_params: GaussParams | null;
  metrics_snapshot: Record<string, MetricParams> | null;
  risk_config: Record<string, { enabled: boolean; limit: number }> | null;
  dashboard_layout?: any;
  distribution_fit?: Record<string, any> | null;
}

export interface Portfolio {
  id: string;
  trading_account_id: string;
  name: string;
  strategy_ids: string[];
  auto_include_new: boolean;
  is_default: boolean;
  max_drawdown_limit: number;
  daily_loss_limit: number;
  total_trades: number;
  net_profit: number;
  equity_curve: EquityPoint[] | null;
  gauss_params: GaussParams | null;
  metrics_snapshot: Record<string, MetricParams> | null;
  risk_config: Record<string, { enabled: boolean; limit: number }> | null;
  dashboard_layout?: any;
  distribution_fit?: Record<string, any> | null;
}

export type RiskAsset = Strategy | Portfolio;

export interface EquityPoint {
  trade: number;
  equity: number;
  date?: string | null;
}

export interface GaussParams {
  mean: number;
  std: number;
  median: number;
  skewness: number;
  kurtosis: number;
  min: number;
  max: number;
  count: number;
}

export interface MetricParams {
  [key: string]: number;
}

export interface CreateStrategyPayload {
  trading_account_id: string;
  name: string;
  description: string;
  magic_number: number;
  start_date: string | null;
  max_drawdown_limit: number;
  daily_loss_limit: number;
}
