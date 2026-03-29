"""Consecutive Losses metric."""

import numpy as np

from . import register_metric
from .base import RiskMetric


@register_metric
class ConsecLossesMetric(RiskMetric):
    name = "consecutive_losses"
    label = "Consec. Losses"
    variable = "consecutive_losses"

    def extract_series(self, trades: list[dict]) -> np.ndarray:
        """Extract lengths of all consecutive losing streaks.

        Returns array of streak lengths, e.g. [3, 1, 5, 2] meaning
        there were 4 losing streaks of those lengths.
        """
        if not trades:
            return np.array([])

        streaks: list[int] = []
        current_streak = 0
        for t in trades:
            if t.get("profit", 0) < 0:
                current_streak += 1
            else:
                if current_streak > 0:
                    streaks.append(current_streak)
                current_streak = 0
        if current_streak > 0:
            streaks.append(current_streak)

        return np.array(streaks) if streaks else np.array([0])

    def compute_current(self, equity_data: dict) -> float:
        return equity_data.get("consecutive_losses", 0)
