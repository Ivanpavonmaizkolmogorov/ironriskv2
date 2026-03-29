"""Stagnation metrics — days and trades without new equity high."""

from collections import defaultdict
import numpy as np

from . import register_metric
from .base import RiskMetric


@register_metric
class StagnationTradesMetric(RiskMetric):
    name = "stagnation_trades"
    label = "Stagnation (trades)"
    variable = "stagnation"

    def extract_series(self, trades: list[dict]) -> np.ndarray:
        """Count trades between consecutive equity highs.

        Returns array of stagnation lengths (nº trades between peaks).
        """
        if not trades:
            return np.array([])

        equity = 0.0
        peak = 0.0
        lengths: list[int] = []
        count_since_peak = 0

        for t in trades:
            equity += t.get("profit", 0)
            count_since_peak += 1
            if equity > peak:
                if count_since_peak > 1:
                    lengths.append(count_since_peak)
                peak = equity
                count_since_peak = 0

        return np.array(lengths) if lengths else np.array([0])

    def compute_current(self, equity_data: dict) -> float:
        return equity_data.get("stagnation_trades", 0)


@register_metric
class StagnationDaysMetric(RiskMetric):
    name = "stagnation_days"
    label = "Stagnation (days)"
    variable = "stagnation"

    def extract_series(self, trades: list[dict]) -> np.ndarray:
        """Count unique trading days between consecutive equity highs."""
        if not trades:
            return np.array([])

        # Group by date, track equity
        daily_profit: dict[str, float] = defaultdict(float)
        for t in trades:
            date_str = str(t.get("time", ""))[:10]
            daily_profit[date_str] += t.get("profit", 0)

        dates = sorted(daily_profit.keys())
        equity = 0.0
        peak = 0.0
        lengths: list[int] = []
        days_since_peak = 0

        for d in dates:
            equity += daily_profit[d]
            days_since_peak += 1
            if equity > peak:
                if days_since_peak > 1:
                    lengths.append(days_since_peak)
                peak = equity
                days_since_peak = 0

        return np.array(lengths) if lengths else np.array([0])

    def compute_current(self, equity_data: dict) -> float:
        return equity_data.get("stagnation_days", 0)
