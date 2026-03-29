"""RiskMetric — abstract base class for all risk metrics."""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import ClassVar

import numpy as np


class RiskMetric(ABC):
    """Contract every risk metric must satisfy.

    Attributes:
        name:     Machine key, e.g. ``"max_drawdown"``.
        label:    Human label, e.g. ``"Max DD"``.
        variable: Key into ``DISTRIBUTION_REGISTRY`` — determines which
                  distributions are tested against this metric's data.
    """

    name: ClassVar[str]
    label: ClassVar[str]
    variable: ClassVar[str]

    @abstractmethod
    def extract_series(self, trades: list[dict]) -> np.ndarray:
        """Extract the numerical series from parsed backtest trades.

        Parameters:
            trades: list of dicts with at least ``profit``, ``time`` keys.

        Returns:
            1-D numpy array of metric values suitable for distribution fitting.
        """

    @abstractmethod
    def compute_current(self, equity_data: dict) -> float:
        """Compute the *current live* value of this metric.

        Parameters:
            equity_data: dict with live stats (equity, peak, floating, etc.)
        """
