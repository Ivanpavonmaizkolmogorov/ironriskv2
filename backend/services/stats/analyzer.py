"""DistributionAnalyzer — core analysis engine.

Iterates over registered metrics and distribution candidates,
runs KS goodness-of-fit tests, and returns the best fit per metric.
"""

from __future__ import annotations

import logging

import numpy as np

from .fit_result import FitResult

# Import subpackages so @register / @register_metric decorators execute
from .distributions import DISTRIBUTION_REGISTRY  # noqa: F401
from .distributions import drawdown as _dd, counts as _counts, stagnation as _stag, daily_loss as _dl  # noqa: F401
from .distributions.hybrid import find_best_hybrid, MIN_HYBRID_SAMPLES, HybridFit

from .metrics import METRIC_REGISTRY  # noqa: F401
from .metrics import drawdown as _m_dd, daily_loss as _m_dl  # noqa: F401
from .metrics import streaks as _m_st, stagnation as _m_sg  # noqa: F401

logger = logging.getLogger(__name__)

MIN_SAMPLES = 20  # minimum data points for reliable fitting


class DistributionAnalyzer:
    """Stateless analyzer — receives data, returns results.

    Does NOT know any metric or distribution by name.
    Discovers everything via METRIC_REGISTRY and DISTRIBUTION_REGISTRY.
    """

    def analyze_strategy(self, trades: list[dict]) -> dict[str, dict]:
        """Run all registered metrics against all registered distributions.

        Parameters:
            trades: list of trade dicts with at least ``profit`` and ``time``.

        Returns:
            Dict mapping metric name → FitResult.to_dict().
        """
        results: dict[str, dict] = {}

        for MetricClass in METRIC_REGISTRY:
            metric = MetricClass()
            series = metric.extract_series(trades)

            if len(series) < MIN_SAMPLES:
                logger.info(
                    "Metric '%s': only %d samples (need %d) — skipping fit",
                    metric.name, len(series), MIN_SAMPLES,
                )
                results[metric.name] = FitResult.empty(metric.name).to_dict()
                continue

            candidates = DISTRIBUTION_REGISTRY.get(metric.variable, [])
            if not candidates:
                logger.warning(
                    "No distributions registered for variable '%s'", metric.variable
                )
                results[metric.name] = FitResult.empty(metric.name).to_dict()
                continue

            best = self._find_best_fit(series, candidates, metric.name)

            # ── Attempt hybrid (splice) fit for continuous variables with enough data ──
            if (
                metric.variable in ("drawdown_abs", "stagnation")
                and len(series) >= MIN_HYBRID_SAMPLES
            ):
                hybrid = find_best_hybrid(series, metric.variable)
                if hybrid is not None and hybrid.p_value > best.p_value:
                    logger.info(
                        "Metric '%s': hybrid fit WINS (%s+%s, p=%.4f vs simple p=%.4f)",
                        metric.name, hybrid.body_label, hybrid.tail_label,
                        hybrid.p_value, best.p_value,
                    )
                    best = FitResult(
                        metric_name=metric.name,
                        distribution_name=hybrid.distribution_name,
                        params=(),
                        p_value=hybrid.p_value,
                        passed=True,
                        is_hybrid=True,
                        hybrid_data=hybrid.to_dict(),
                        raw_data=series,
                    )

            results[metric.name] = best.to_dict()

            logger.info(
                "Metric '%s': best fit = %s (p=%.4f, passed=%s)",
                metric.name, best.distribution_name, best.p_value, best.passed,
            )

        return results

    def analyze_single(
        self, data: np.ndarray, variable: str, metric_name: str = ""
    ) -> FitResult:
        """Fit a single data series against candidates for *variable*."""
        if len(data) < MIN_SAMPLES:
            return FitResult.empty(metric_name)

        candidates = DISTRIBUTION_REGISTRY.get(variable, [])
        return self._find_best_fit(data, candidates, metric_name)

    # ── private ─────────────────────────────────────────────────

    @staticmethod
    def _find_best_fit(
        data: np.ndarray,
        candidates: list,
        metric_name: str,
    ) -> FitResult:
        """Try each candidate, return the one with highest p-value > 0.05."""
        best: FitResult | None = None

        for DistClass in candidates:
            try:
                params = DistClass.fit(data)
                stat, p_value = DistClass.test(data, params)
            except Exception as exc:
                logger.debug(
                    "Fit failed for %s on %s: %s", DistClass.name, metric_name, exc
                )
                continue

            if p_value > 0.05 and (best is None or p_value > best.p_value):
                best = FitResult(
                    metric_name=metric_name,
                    distribution_name=DistClass.scipy_name,
                    params=params,
                    p_value=p_value,
                    passed=True,
                    raw_data=data,
                )

        if best is not None:
            return best

        # No distribution passed — empirical fallback
        return FitResult(
            metric_name=metric_name,
            distribution_name="empirical",
            params=(),
            p_value=0.0,
            passed=False,
            raw_data=data,
        )
