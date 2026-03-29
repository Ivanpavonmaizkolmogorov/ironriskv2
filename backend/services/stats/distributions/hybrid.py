"""Hybrid (Splice) distributions — Body + Tail EVT model.

Iterates all valid combinations of body distributions (fitted on data <= percentile)
and tail distributions (fitted on data > percentile), returning the best combined
KS p-value. Only activated when len(data) >= MIN_HYBRID_SAMPLES.
"""

from __future__ import annotations

import logging
from itertools import product
from typing import Optional

import numpy as np
from scipy import stats as sp_stats
from scipy.stats import kstest

from . import DISTRIBUTION_REGISTRY, DistributionCandidate

logger = logging.getLogger(__name__)

MIN_HYBRID_SAMPLES = 500  # Minimum trades to unlock hybrid mode


class HybridFit:
    """Immutable result of a hybrid (splice) fit.

    Stores body and tail distribution parameters separately,
    plus the splice percentile used to separate them.
    """

    def __init__(
        self,
        body_scipy_name: str,
        body_params: tuple,
        tail_scipy_name: str,
        tail_params: tuple,
        splice_percentile: float,
        splice_value: float,
        p_value: float,
        body_label: str = "",
        tail_label: str = "",
    ):
        self.body_scipy_name = body_scipy_name
        self.body_params = body_params
        self.tail_scipy_name = tail_scipy_name
        self.tail_params = tail_params
        self.splice_percentile = splice_percentile
        self.splice_value = splice_value
        self.p_value = p_value
        self.body_label = body_label
        self.tail_label = tail_label

    @property
    def distribution_name(self) -> str:
        """Human-readable label for the hybrid model."""
        return f"hybrid({self.body_label}+{self.tail_label})"

    def pdf(self, x: np.ndarray) -> np.ndarray:
        """Evaluate the spliced PDF at points x.

        Uses the body distribution for x <= splice_value,
        and the tail distribution for x > splice_value.
        The two halves are weighted by the splice percentile fraction so
        the total area integrates to ~1.
        """
        body_dist = getattr(sp_stats, self.body_scipy_name)
        tail_dist = getattr(sp_stats, self.tail_scipy_name)

        weight_body = self.splice_percentile / 100.0
        weight_tail = 1.0 - weight_body

        y = np.zeros_like(x, dtype=float)
        mask_body = x <= self.splice_value
        mask_tail = ~mask_body

        if np.any(mask_body) and weight_body > 0:
            body_pdf = body_dist.pdf(x[mask_body], *self.body_params)
            # Normalize body PDF so its integral over (-inf, splice] = 1
            body_cdf_at_splice = body_dist.cdf(self.splice_value, *self.body_params)
            if body_cdf_at_splice > 0:
                body_pdf = body_pdf / body_cdf_at_splice
            y[mask_body] = weight_body * body_pdf

        if np.any(mask_tail) and weight_tail > 0:
            tail_pdf = tail_dist.pdf(x[mask_tail], *self.tail_params)
            # Normalize tail PDF so its integral over (splice, inf) = 1
            tail_sf_at_splice = tail_dist.sf(self.splice_value, *self.tail_params)
            if tail_sf_at_splice > 0:
                tail_pdf = tail_pdf / tail_sf_at_splice
            y[mask_tail] = weight_tail * tail_pdf

        return y

    def cdf(self, x: np.ndarray) -> np.ndarray:
        """Evaluate the spliced CDF at points x."""
        body_dist = getattr(sp_stats, self.body_scipy_name)
        tail_dist = getattr(sp_stats, self.tail_scipy_name)

        weight_body = self.splice_percentile / 100.0
        weight_tail = 1.0 - weight_body

        result = np.zeros_like(x, dtype=float)
        mask_body = x <= self.splice_value
        mask_tail = ~mask_body

        if np.any(mask_body) and weight_body > 0:
            body_cdf_at_splice = body_dist.cdf(self.splice_value, *self.body_params)
            if body_cdf_at_splice > 0:
                result[mask_body] = weight_body * (
                    body_dist.cdf(x[mask_body], *self.body_params) / body_cdf_at_splice
                )

        if np.any(mask_tail) and weight_tail > 0:
            tail_sf_at_splice = tail_dist.sf(self.splice_value, *self.tail_params)
            if tail_sf_at_splice > 0:
                tail_cdf_portion = (
                    tail_dist.cdf(x[mask_tail], *self.tail_params)
                    - tail_dist.cdf(self.splice_value, *self.tail_params)
                ) / tail_sf_at_splice
                result[mask_tail] = weight_body + weight_tail * tail_cdf_portion

        return np.clip(result, 0, 1)

    def ppf(self, q: float) -> float:
        """Inverse CDF (percent-point function) for quantile q ∈ [0, 1]."""
        weight_body = self.splice_percentile / 100.0

        if q <= weight_body:
            # Falls in the body region
            body_dist = getattr(sp_stats, self.body_scipy_name)
            body_cdf_at_splice = body_dist.cdf(self.splice_value, *self.body_params)
            adjusted_q = (q / weight_body) * body_cdf_at_splice if weight_body > 0 else 0
            return float(body_dist.ppf(adjusted_q, *self.body_params))
        else:
            # Falls in the tail region
            tail_dist = getattr(sp_stats, self.tail_scipy_name)
            weight_tail = 1.0 - weight_body
            tail_sf_at_splice = tail_dist.sf(self.splice_value, *self.tail_params)
            adjusted_q = (
                tail_dist.cdf(self.splice_value, *self.tail_params)
                + ((q - weight_body) / weight_tail) * tail_sf_at_splice
            ) if weight_tail > 0 else 0.5
            return float(tail_dist.ppf(adjusted_q, *self.tail_params))

    def to_dict(self) -> dict:
        """Serialize to JSON-safe dict for DB storage."""
        return {
            "body_scipy_name": self.body_scipy_name,
            "body_params": list(self.body_params),
            "tail_scipy_name": self.tail_scipy_name,
            "tail_params": list(self.tail_params),
            "splice_percentile": self.splice_percentile,
            "splice_value": self.splice_value,
            "p_value": round(self.p_value, 6),
            "body_label": self.body_label,
            "tail_label": self.tail_label,
        }

    @classmethod
    def from_dict(cls, d: dict) -> HybridFit:
        return cls(
            body_scipy_name=d["body_scipy_name"],
            body_params=tuple(d["body_params"]),
            tail_scipy_name=d["tail_scipy_name"],
            tail_params=tuple(d["tail_params"]),
            splice_percentile=d["splice_percentile"],
            splice_value=d["splice_value"],
            p_value=d.get("p_value", 0.0),
            body_label=d.get("body_label", ""),
            tail_label=d.get("tail_label", ""),
        )


def find_best_hybrid(
    data: np.ndarray,
    variable: str,
    splice_percentile: float = 90.0,
) -> Optional[HybridFit]:
    """Try all body × tail combinations for a variable and return the best hybrid fit.

    Only combinations where the body distribution fits the lower portion
    AND the tail distribution fits the upper portion are considered.
    The combined p-value is the minimum of both individual KS tests.

    Returns None if no valid hybrid fit is found (p > 0.05 for both halves).
    """
    candidates = DISTRIBUTION_REGISTRY.get(variable, [])
    if len(candidates) < 2:
        return None

    splice_value = float(np.percentile(data, splice_percentile))
    body_data = data[data <= splice_value]
    tail_data = data[data > splice_value]

    if len(body_data) < 20 or len(tail_data) < 10:
        return None

    best: Optional[HybridFit] = None

    for BodyDist, TailDist in product(candidates, repeat=2):
        # Allow same distribution with different params for body vs tail
        try:
            body_params = BodyDist.fit(body_data)
            body_stat, body_p = BodyDist.test(body_data, body_params)
        except Exception:
            continue

        if body_p < 0.05:
            continue

        try:
            tail_params = TailDist.fit(tail_data)
            tail_stat, tail_p = TailDist.test(tail_data, tail_params)
        except Exception:
            continue

        if tail_p < 0.05:
            continue

        combined_p = min(body_p, tail_p)

        if best is None or combined_p > best.p_value:
            best = HybridFit(
                body_scipy_name=BodyDist.scipy_name,
                body_params=body_params,
                tail_scipy_name=TailDist.scipy_name,
                tail_params=tail_params,
                splice_percentile=splice_percentile,
                splice_value=splice_value,
                p_value=combined_p,
                body_label=BodyDist.name,
                tail_label=TailDist.name,
            )

    return best
