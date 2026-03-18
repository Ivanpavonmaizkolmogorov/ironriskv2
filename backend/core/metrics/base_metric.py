"""Base metric interface — Strategy Pattern for risk metrics."""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import List


@dataclass
class MetricResult:
    """Standardized result from any metric evaluation."""

    name: str
    value: float
    percentile: float
    zone: str  # "NORMAL" | "WARNING" | "CRITICAL"
    threshold_warning: float
    threshold_critical: float


class BaseMetric(ABC):
    """Abstract interface that all risk metrics must implement.

    Strategy Pattern: each metric is an interchangeable object.
    The RiskEngine orchestrator calls them polymorphically.
    """

    @abstractmethod
    def compute_from_backtest(self, trades: List[dict]) -> dict:
        """Compute statistical distribution from historical CSV trades.

        Returns a dict of parameters to persist in DB
        (mean, std, percentiles, etc.)
        """
        ...

    @abstractmethod
    def evaluate_live(self, live_data: dict, backtest_params: dict) -> MetricResult:
        """Compare a live data point against the backtest distribution.

        Returns the current risk zone.
        """
        ...
