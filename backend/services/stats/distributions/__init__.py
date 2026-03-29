"""Distribution Registry — auto-registration of distribution candidates.

Each distribution class decorates itself with ``@register("variable_name")``
so the ``DistributionAnalyzer`` discovers them automatically.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import ClassVar

import numpy as np
from scipy.stats import kstest

# ── Registry ────────────────────────────────────────────────────

DISTRIBUTION_REGISTRY: dict[str, list[type["DistributionCandidate"]]] = {
    "drawdown_abs": [],
    "consecutive_losses": [],
    "stagnation": [],
    "daily_loss": [],
}


def register(variable: str):
    """Class decorator — registers a distribution candidate for a variable."""
    def decorator(cls: type[DistributionCandidate]):
        DISTRIBUTION_REGISTRY.setdefault(variable, [])
        DISTRIBUTION_REGISTRY[variable].append(cls)
        return cls
    return decorator


# ── Base class ──────────────────────────────────────────────────

class DistributionCandidate(ABC):
    """Contract every distribution candidate must satisfy."""

    name: ClassVar[str]          # Human-readable, e.g. "t-Student"
    scipy_name: ClassVar[str]    # scipy.stats attribute name, e.g. "t"

    @staticmethod
    @abstractmethod
    def fit(data: np.ndarray) -> tuple:
        """Fit distribution to data, return MLE params."""

    @staticmethod
    @abstractmethod
    def test(data: np.ndarray, params: tuple) -> tuple[float, float]:
        """Run KS goodness-of-fit test. Return (statistic, p_value)."""
