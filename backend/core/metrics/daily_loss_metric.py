"""Daily loss metric — measures current calendar daily loss vs historical distribution."""

import numpy as np
from typing import List

from .base_metric import BaseMetric, MetricResult


class DailyLossMetric(BaseMetric):
    """Measures the current daily loss against the backtest daily loss distribution."""

    def compute_from_backtest(self, trades: List[dict]) -> dict:
        if not trades:
            return {
                "max_daily_loss": 0.0,
                "mean_daily_loss": 0.0,
                "std_daily_loss": 0.0,
                "percentile_90": 0.0,
                "percentile_95": 0.0,
                "percentile_99": 0.0,
            }

        daily_pnl: dict[str, float] = {}
        for t in trades:
            date_str = str(t.get("exit_time") or t.get("date") or "")
            if date_str:
                day_key = date_str[:10]  # YYYY-MM-DD
                daily_pnl[day_key] = daily_pnl.get(day_key, 0.0) + float(t.get("pnl", 0.0))

        # We care about actual losing days to build the risk distribution of losses
        losses = [abs(pnl) for pnl in daily_pnl.values() if pnl < 0]

        if not losses:
            return {
                "max_daily_loss": 0.0,
                "mean_daily_loss": 0.0,
                "std_daily_loss": 0.0,
                "percentile_90": 0.0,
                "percentile_95": 0.0,
                "percentile_99": 0.0,
            }

        loss_arr = np.array(losses, dtype=np.float64)

        return {
            "max_daily_loss": float(np.max(loss_arr)),
            "mean_daily_loss": float(np.mean(loss_arr)),
            "std_daily_loss": float(np.std(loss_arr)),
            "percentile_90": float(np.percentile(loss_arr, 90)),
            "percentile_95": float(np.percentile(loss_arr, 95)),
            "percentile_99": float(np.percentile(loss_arr, 99)),
        }

    def evaluate_live(self, live_data: dict, backtest_params: dict) -> MetricResult:
        current_loss = abs(live_data.get("daily_loss", 0.0))
        mean = backtest_params.get("mean_daily_loss", 0.0)
        std = backtest_params.get("std_daily_loss", 0.0)

        warning_threshold = mean + std
        critical_threshold = mean + 2 * std

        if current_loss <= warning_threshold:
            zone = "NORMAL"
        elif current_loss <= critical_threshold:
            zone = "WARNING"
        else:
            zone = "CRITICAL"

        max_loss = backtest_params.get("max_daily_loss", 0.0)
        percentile = min(current_loss / max_loss * 100, 100.0) if max_loss > 0 else 0.0

        return MetricResult(
            name="daily_loss",
            value=current_loss,
            percentile=percentile,
            zone=zone,
            threshold_warning=warning_threshold,
            threshold_critical=critical_threshold,
        )
