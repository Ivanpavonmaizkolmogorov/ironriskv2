"""Stagnation Days metric — measures calendar days without new equity highs."""

import numpy as np
from datetime import datetime
from typing import List

from .base_metric import BaseMetric, MetricResult


class StagnationDaysMetric(BaseMetric):
    """Measures how many calendar days the equity has been stagnant
    (no new high-water mark) vs the historical distribution.
    """

    def compute_from_backtest(self, trades: List[dict]) -> dict:
        if not trades:
            return {
                "max_stagnation_days": 0,
                "mean_stagnation_days": 0.0,
                "std_stagnation_days": 0.0,
                "percentile_90": 0.0,
                "percentile_95": 0.0,
            }

        # Build equity curve with dates
        pnls = np.array([t["pnl"] for t in trades], dtype=np.float64)
        equity = np.cumsum(pnls)

        # Parse exit dates
        dates: List[datetime] = []
        for t in trades:
            dt = t.get("exit_time") or t.get("close_time") or t.get("date")
            if isinstance(dt, str):
                # Try common formats
                for fmt in ("%Y.%m.%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M:%S", "%Y-%m-%d"):
                    try:
                        dt = datetime.strptime(dt, fmt)
                        break
                    except ValueError:
                        continue
            if isinstance(dt, datetime):
                dates.append(dt)
            else:
                dates.append(datetime.now())  # fallback

        # Calculate stagnation periods (days between high-water marks)
        stagnation_periods: List[int] = []
        hwm = equity[0]
        hwm_date = dates[0]

        for i in range(1, len(equity)):
            if equity[i] > hwm:
                days = (dates[i] - hwm_date).days
                if days > 0:
                    stagnation_periods.append(days)
                hwm = equity[i]
                hwm_date = dates[i]

        # Final stagnation (from last HWM to last trade)
        if dates:
            final_stag = (dates[-1] - hwm_date).days
            if final_stag > 0:
                stagnation_periods.append(final_stag)

        if not stagnation_periods:
            stagnation_periods = [0]

        arr = np.array(stagnation_periods, dtype=np.float64)
        return {
            "max_stagnation_days": int(np.max(arr)),
            "mean_stagnation_days": float(np.mean(arr)),
            "std_stagnation_days": float(np.std(arr)),
            "percentile_90": float(np.percentile(arr, 90)),
            "percentile_95": float(np.percentile(arr, 95)),
        }

    def evaluate_live(self, live_data: dict, backtest_params: dict) -> MetricResult:
        current_days = live_data.get("stagnation_days", 0)
        mean = backtest_params["mean_stagnation_days"]
        std = backtest_params["std_stagnation_days"]

        warning_threshold = mean + std
        critical_threshold = mean + 2 * std

        if current_days <= warning_threshold:
            zone = "NORMAL"
        elif current_days <= critical_threshold:
            zone = "WARNING"
        else:
            zone = "CRITICAL"

        max_val = backtest_params["max_stagnation_days"]
        percentile = min(current_days / max_val * 100, 100.0) if max_val > 0 else 0.0

        return MetricResult(
            name="stagnation_days",
            value=float(current_days),
            percentile=percentile,
            zone=zone,
            threshold_warning=warning_threshold,
            threshold_critical=critical_threshold,
        )
