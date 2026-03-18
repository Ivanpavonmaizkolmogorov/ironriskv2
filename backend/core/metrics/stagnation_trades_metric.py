"""Stagnation Trades metric — measures number of trades without new equity highs."""

import numpy as np
from typing import List

from .base_metric import BaseMetric, MetricResult


class StagnationTradesMetric(BaseMetric):
    """Measures how many consecutive trades pass without making a new
    equity high-water mark, compared to the historical distribution.
    """

    def compute_from_backtest(self, trades: List[dict]) -> dict:
        if not trades:
            return {
                "max_stagnation_trades": 0,
                "mean_stagnation_trades": 0.0,
                "std_stagnation_trades": 0.0,
                "percentile_90": 0.0,
                "percentile_95": 0.0,
            }

        pnls = np.array([t["pnl"] for t in trades], dtype=np.float64)
        equity = np.cumsum(pnls)

        # Count trades between each high-water mark
        stagnation_periods: List[int] = []
        hwm = equity[0]
        trades_since_hwm = 0

        for i in range(1, len(equity)):
            trades_since_hwm += 1
            if equity[i] > hwm:
                if trades_since_hwm > 0:
                    stagnation_periods.append(trades_since_hwm)
                hwm = equity[i]
                trades_since_hwm = 0

        # Final stagnation
        if trades_since_hwm > 0:
            stagnation_periods.append(trades_since_hwm)

        if not stagnation_periods:
            stagnation_periods = [0]

        arr = np.array(stagnation_periods, dtype=np.float64)
        return {
            "max_stagnation_trades": int(np.max(arr)),
            "mean_stagnation_trades": float(np.mean(arr)),
            "std_stagnation_trades": float(np.std(arr)),
            "percentile_90": float(np.percentile(arr, 90)),
            "percentile_95": float(np.percentile(arr, 95)),
        }

    def evaluate_live(self, live_data: dict, backtest_params: dict) -> MetricResult:
        current_trades = live_data.get("stagnation_trades", 0)
        mean = backtest_params["mean_stagnation_trades"]
        std = backtest_params["std_stagnation_trades"]

        warning_threshold = mean + std
        critical_threshold = mean + 2 * std

        if current_trades <= warning_threshold:
            zone = "NORMAL"
        elif current_trades <= critical_threshold:
            zone = "WARNING"
        else:
            zone = "CRITICAL"

        max_val = backtest_params["max_stagnation_trades"]
        percentile = min(current_trades / max_val * 100, 100.0) if max_val > 0 else 0.0

        return MetricResult(
            name="stagnation_trades",
            value=float(current_trades),
            percentile=percentile,
            zone=zone,
            threshold_warning=warning_threshold,
            threshold_critical=critical_threshold,
        )
