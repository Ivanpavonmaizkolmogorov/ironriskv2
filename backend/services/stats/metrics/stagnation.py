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
        """Count unique calendar days between consecutive equity highs."""
        if not trades:
            return np.array([])

        from datetime import datetime
        equity = 0.0
        peak = 0.0
        lengths: list[int] = []
        peak_date = None

        for t in trades:
            profit = t.get("profit", 0)
            
            try:
                time_str = str(t.get("time", "")).replace(".", "-")[:10]
                current_date = datetime.strptime(time_str, "%Y-%m-%d")
            except ValueError:
                continue
                
            equity += profit
            
            if equity > peak:
                if peak_date is not None:
                    days_since = (current_date - peak_date).days
                    if days_since > 0:
                        lengths.append(days_since)
                peak = equity
                peak_date = current_date

        return np.array(lengths) if lengths else np.array([0])

    def compute_current(self, equity_data: dict) -> float:
        return equity_data.get("stagnation_days", 0)
