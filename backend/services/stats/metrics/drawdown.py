"""Max Drawdown metric."""

import numpy as np

from . import register_metric
from .base import RiskMetric


@register_metric
class MaxDrawdownMetric(RiskMetric):
    name = "max_drawdown"
    label = "Current DD"
    variable = "drawdown_abs"

    def extract_series(self, trades: list[dict]) -> np.ndarray:
        """Compute running drawdowns from the backtest equity curve.

        Returns an array of individual drawdown depths (positive values)
        at each trade close.
        """
        if not trades:
            return np.array([])

        # Build cumulative equity
        profits = [t.get("profit", 0) for t in trades]
        equity = np.cumsum(profits)
        peak = np.maximum.accumulate(equity)
        drawdowns = peak - equity  # always >= 0
        # Only keep non-zero drawdown values for fitting
        dd_values = drawdowns[drawdowns > 0]
        return dd_values if len(dd_values) > 0 else np.array([0.0])

    def compute_current(self, equity_data: dict) -> float:
        peak = equity_data.get("peak", 0)
        equity = equity_data.get("equity", 0)
        return max(peak - equity, 0)
