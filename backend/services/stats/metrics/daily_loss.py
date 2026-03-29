"""Daily Loss metric."""

from collections import defaultdict
import numpy as np

from . import register_metric
from .base import RiskMetric


@register_metric
class DailyLossMetric(RiskMetric):
    name = "daily_loss"
    label = "Daily Loss"
    variable = "drawdown_abs"  # Daily losses map to the same bounded [0, inf) distributions as drawdown

    def extract_series(self, trades: list[dict]) -> np.ndarray:
        """Aggregate trades by date and return daily PnL series.

        Only includes losing days (negative daily PnL) for fitting,
        since we model the loss tail.
        """
        if not trades:
            return np.array([])

        daily: dict[str, float] = defaultdict(float)
        for t in trades:
            date_str = str(t.get("time", ""))[:10]  # YYYY-MM-DD
            daily[date_str] += t.get("profit", 0)

        # Only keep losing days, and return them as positive loss amounts
        daily_losses = [-pnl for pnl in daily.values() if pnl < 0]
        return np.array(daily_losses) if daily_losses else np.array([0.0])

    def compute_current(self, equity_data: dict) -> float:
        return equity_data.get("daily_pnl", 0)
