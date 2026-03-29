"""Expected Payoff (PnL) metric — measures live trade PnL against historical distribution."""

import numpy as np
from typing import List

from .base_metric import BaseMetric, MetricResult


class PnlMetric(BaseMetric):
    """Measures the live Expected Payoff against the backtest PnL distribution.

    Computes the statistical parameters (mean, std) of individual trade PnLs
    to classify live performance into sigma-based zones (detecting Alpha Decay).
    """

    def compute_from_backtest(self, trades: List[dict]) -> dict:
        if not trades:
            return {
                "max_pnl": 0.0,
                "min_pnl": 0.0,
                "mean_pnl": 0.0,
                "std_pnl": 0.0,
            }

        pnls = np.array([t["pnl"] for t in trades], dtype=np.float64)

        return {
            "max_pnl": float(np.max(pnls)),
            "min_pnl": float(np.min(pnls)),
            "mean_pnl": float(np.mean(pnls)),
            "std_pnl": float(np.std(pnls)) if len(pnls) > 1 else 0.0,
        }

    def evaluate_live(self, live_data: dict, backtest_params: dict) -> MetricResult:
        # The EA heartbeat sends "current_pnl" (which implies last trade pnl or current floating pnl tracking)
        current_pnl = float(live_data.get("current_pnl", backtest_params["mean_pnl"]))
        
        mean = backtest_params["mean_pnl"]
        std = backtest_params["std_pnl"]

        # Classify by sigma bands (downside deviation is bad for Payoff)
        warning_threshold = mean - std
        critical_threshold = mean - 2 * std

        if current_pnl >= warning_threshold:
            zone = "NORMAL"
        elif current_pnl >= critical_threshold:
            zone = "WARNING"
        else:
            zone = "CRITICAL"

        # Approximate percentile position based on Normal CDF
        import scipy.stats as st
        percentile = 50.0
        if std > 0:
            percentile = float(st.norm.cdf(current_pnl, loc=mean, scale=std)) * 100.0

        return MetricResult(
            name="expected_payoff",
            value=current_pnl,
            percentile=percentile,
            zone=zone,
            threshold_warning=warning_threshold,
            threshold_critical=critical_threshold,
        )
