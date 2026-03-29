"""FitResult — immutable result of a distribution fit."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

import numpy as np
from scipy import stats as sp_stats


@dataclass(frozen=True)
class FitResult:
    """Immutable result of fitting a distribution to data.

    If ``passed`` is True the named scipy distribution was accepted by KS test.
    Otherwise ``distribution_name`` is ``"empirical"`` and ``percentile()``
    falls back to the raw data.
    """

    metric_name: str  # e.g. "max_drawdown", "pnl_per_trade"
    distribution_name: str  # e.g. "norm", "t", "empirical", "hybrid(Weibull+Pareto)"
    params: tuple = ()
    p_value: float = 0.0
    passed: bool = False
    is_hybrid: bool = False  # True when a splice (body+tail) model was used
    hybrid_data: dict = field(default_factory=dict, repr=False)  # Serialized HybridFit
    raw_data: np.ndarray = field(default_factory=lambda: np.array([]), repr=False)
    empirical_percentiles: list[float] = field(default_factory=list, repr=False)

    def __post_init__(self):
        # Compute percentiles [0..100] once, so we don't need raw_data later
        if len(self.raw_data) > 0 and not self.empirical_percentiles:
            perc = np.percentile(self.raw_data, np.arange(101)).tolist()
            object.__setattr__(self, "empirical_percentiles", perc)

    # ── public API ──────────────────────────────────────────────

    def percentile(self, value: float) -> int:
        """Return the percentile (0-100) where *value* falls.

        Uses the CDF of the fitted distribution when available,
        otherwise falls back to empirical percentile on raw_data.
        """
        if self.passed and self.distribution_name != "empirical":
            dist = getattr(sp_stats, self.distribution_name)
            return int(np.clip(dist.cdf(value, *self.params) * 100, 0, 100))
        # Empirical fallback
        if self.empirical_percentiles:
            # searchsorted returns index 0..101; cap at 100.
            idx = np.searchsorted(self.empirical_percentiles, value)
            return int(np.clip(idx, 0, 100))
        return 0

    def pdf(self, x: np.ndarray) -> np.ndarray:
        """Probability density function evaluated at *x*."""
        if self.is_hybrid and self.hybrid_data:
            from .distributions.hybrid import HybridFit
            hf = HybridFit.from_dict(self.hybrid_data)
            return hf.pdf(x)
        if self.passed and self.distribution_name != "empirical":
            dist = getattr(sp_stats, self.distribution_name)
            return dist.pdf(x, *self.params)
        return np.zeros_like(x)

    def ppf(self, q: float) -> float:
        """Percent-point (inverse CDF) for quantile *q* ∈ [0, 1]."""
        if self.is_hybrid and self.hybrid_data:
            from .distributions.hybrid import HybridFit
            hf = HybridFit.from_dict(self.hybrid_data)
            return hf.ppf(q)
        if self.passed and self.distribution_name != "empirical":
            dist = getattr(sp_stats, self.distribution_name)
            return float(dist.ppf(q, *self.params))
        if len(self.raw_data) == 0:
            return 0.0
        return float(np.quantile(self.raw_data, q))

    def get_mapped_params(self) -> dict[str, float]:
        """Maps scipy parameter tuple to their named arguments (e.g. loc, scale, c)."""
        if not self.passed or self.distribution_name == "empirical" or not self.params:
            return {}
        try:
            dist = getattr(sp_stats, self.distribution_name)
            shapes = [s.strip() for s in dist.shapes.split(',')] if dist.shapes else []
            param_names = shapes + ['loc', 'scale']
            return {name: float(val) for name, val in zip(param_names, self.params)}
        except Exception:
            return {}

    # ── serialisation ───────────────────────────────────────────

    def to_dict(self) -> dict:
        """Serialise to JSON-safe dict for DB storage."""
        d = {
            "metric_name": self.metric_name,
            "distribution_name": self.distribution_name,
            "params": list(self.params),
            "p_value": round(self.p_value, 6),
            "passed": self.passed,
            "is_hybrid": self.is_hybrid,
            "empirical_percentiles": self.empirical_percentiles,
            # raw_data is NOT persisted — too large.
        }
        if self.is_hybrid and self.hybrid_data:
            d["hybrid_data"] = self.hybrid_data
        return d

    @classmethod
    def from_dict(cls, d: dict, raw_data: Optional[np.ndarray] = None) -> FitResult:
        return cls(
            metric_name=d.get("metric_name", ""),
            distribution_name=d.get("distribution_name", "empirical"),
            params=tuple(d.get("params", [])),
            p_value=d.get("p_value", 0.0),
            passed=d.get("passed", False),
            is_hybrid=d.get("is_hybrid", False),
            hybrid_data=d.get("hybrid_data", {}),
            raw_data=raw_data if raw_data is not None else np.array([]),
            empirical_percentiles=d.get("empirical_percentiles", []),
        )

    @classmethod
    def empty(cls, metric_name: str) -> FitResult:
        """Placeholder when there is not enough data."""
        return cls(metric_name=metric_name, distribution_name="none", passed=False)
