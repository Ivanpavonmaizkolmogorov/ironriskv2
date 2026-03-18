"""Consecutive Losses metric — measures streaks of losing trades."""

import numpy as np
from typing import List

from .base_metric import BaseMetric, MetricResult


class ConsecutiveLossesMetric(BaseMetric):
    """Measures the current streak of consecutive losing trades
    vs the historical distribution of losing streaks.
    """

    def compute_from_backtest(self, trades: List[dict]) -> dict:
        if not trades:
            return {
                "max_consecutive_losses": 0,
                "mean_consecutive_losses": 0.0,
                "std_consecutive_losses": 0.0,
                "percentile_90": 0.0,
                "percentile_95": 0.0,
            }

        # Find all losing streaks
        streaks: List[int] = []
        current_streak = 0

        for t in trades:
            pnl = t.get("pnl", 0.0)
            if pnl < 0:
                current_streak += 1
            else:
                if current_streak > 0:
                    streaks.append(current_streak)
                current_streak = 0

        # Don't forget the last streak
        if current_streak > 0:
            streaks.append(current_streak)

        if not streaks:
            streaks = [0]

        arr = np.array(streaks, dtype=np.float64)
        return {
            "max_consecutive_losses": int(np.max(arr)),
            "mean_consecutive_losses": float(np.mean(arr)),
            "std_consecutive_losses": float(np.std(arr)),
            "percentile_90": float(np.percentile(arr, 90)),
            "percentile_95": float(np.percentile(arr, 95)),
        }

    def evaluate_live(self, live_data: dict, backtest_params: dict) -> MetricResult:
        current_streak = live_data.get("consecutive_losses", 0)
        mean = backtest_params["mean_consecutive_losses"]
        std = backtest_params["std_consecutive_losses"]

        warning_threshold = mean + std
        critical_threshold = mean + 2 * std

        if current_streak <= warning_threshold:
            zone = "NORMAL"
        elif current_streak <= critical_threshold:
            zone = "WARNING"
        else:
            zone = "CRITICAL"

        max_val = backtest_params["max_consecutive_losses"]
        percentile = min(current_streak / max_val * 100, 100.0) if max_val > 0 else 0.0

        return MetricResult(
            name="consecutive_losses",
            value=float(current_streak),
            percentile=percentile,
            zone=zone,
            threshold_warning=warning_threshold,
            threshold_critical=critical_threshold,
        )
