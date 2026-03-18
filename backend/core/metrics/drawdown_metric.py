"""Drawdown metric — measures current drawdown vs historical distribution."""

import numpy as np
from typing import List

from .base_metric import BaseMetric, MetricResult


class DrawdownMetric(BaseMetric):
    """Measures the current drawdown against the backtest drawdown distribution.

    Computes the full drawdown series from the equity curve and derives
    statistical parameters (mean, std, percentiles) to classify live
    drawdown into sigma-based zones.
    """

    def compute_from_backtest(self, trades: List[dict]) -> dict:
        if not trades:
            return {
                "max_drawdown": 0.0,
                "mean_drawdown": 0.0,
                "std_drawdown": 0.0,
                "percentile_90": 0.0,
                "percentile_95": 0.0,
                "percentile_99": 0.0,
            }

        pnls = np.array([t["pnl"] for t in trades], dtype=np.float64)
        equity_curve = np.cumsum(pnls)
        running_max = np.maximum.accumulate(equity_curve)
        drawdowns = running_max - equity_curve

        # Filter only non-zero drawdowns for meaningful statistics
        nonzero_dd = drawdowns[drawdowns > 0]
        if len(nonzero_dd) == 0:
            nonzero_dd = drawdowns  # All zeros — no drawdown at all

        return {
            "max_drawdown": float(np.max(drawdowns)),
            "mean_drawdown": float(np.mean(nonzero_dd)),
            "std_drawdown": float(np.std(nonzero_dd)),
            "percentile_90": float(np.percentile(drawdowns, 90)),
            "percentile_95": float(np.percentile(drawdowns, 95)),
            "percentile_99": float(np.percentile(drawdowns, 99)),
        }

    def evaluate_live(self, live_data: dict, backtest_params: dict) -> MetricResult:
        current_dd = abs(live_data.get("current_drawdown", 0.0))
        mean = backtest_params["mean_drawdown"]
        std = backtest_params["std_drawdown"]

        # Classify by sigma bands
        warning_threshold = mean + std
        critical_threshold = mean + 2 * std

        if current_dd <= warning_threshold:
            zone = "NORMAL"
        elif current_dd <= critical_threshold:
            zone = "WARNING"
        else:
            zone = "CRITICAL"

        # Approximate percentile position
        max_dd = backtest_params["max_drawdown"]
        percentile = min(current_dd / max_dd * 100, 100.0) if max_dd > 0 else 0.0

        return MetricResult(
            name="drawdown",
            value=current_dd,
            percentile=percentile,
            zone=zone,
            threshold_warning=warning_threshold,
            threshold_critical=critical_threshold,
        )
