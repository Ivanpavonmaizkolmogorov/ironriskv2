"""BayesEngine — Computes the Bayesian Probability of Edge Survival.

Implements P(A|B,C,...) using Naive Bayes factorization:
  P(A|B,C,...) = P(B|A) * P(C|A) * ... * P(A) / P(B,C,...)

Where:
  A = "The edge is still alive (EV > 0)"
  B = Current drawdown (monetary)
  C = Current stagnation days
  D = Current consecutive losses
  ...

The Likelihood P(x|A) is computed as the survival function (1 - CDF)
of the fitted distribution at the observed value — i.e., the area
to the RIGHT of the current value in the backtest distribution.
This is exactly what the user sees in the interactive chart tooltip.
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field
from typing import Optional

import numpy as np
from scipy import stats as sp_stats

from .fit_result import FitResult

logger = logging.getLogger(__name__)

# Default neutral prior for a new bot with no track record
DEFAULT_PRIOR = 0.5

# Maximum posterior (the system NEVER reaches 100% confidence, even with perfect data)
MAX_POSTERIOR = 0.85

# Minimum trades required to compute a meaningful credibility interval
MIN_TRADES_FOR_CI = 30


@dataclass
class BayesResult:
    """Output of a Bayesian edge survival evaluation."""
    prior: float                          # P(A) — bot reputation
    posterior: float                       # P(A|B,C,...) — probability edge is alive
    p_evidence: float                      # P(B) — marginal probability of the evidence
    p_likelihood: float                    # P(B|A) — joint likelihood (product of all)
    p_null: float                           # P(B|¬A) — null hypothesis likelihood
    likelihoods: dict[str, float]         # {metric_name: P(evidence|A)}
    evidence_values: dict[str, float]     # {metric_name: current_monetary_value}
    ci_data: dict | None                  # Full CI data with intermediates, or None
    ev_includes_zero: bool | None         # True = edge possibly dead, None = indeterminate
    hwm_recoveries: int                   # Number of historical recoveries

    def to_dict(self) -> dict:
        ci_dict = self.ci_data if self.ci_data else None
        # Sanitize ci_dict values to pure Python types (no numpy)
        if ci_dict:
            ci_dict = {k: (int(v) if isinstance(v, int) else float(v) if isinstance(v, float) else v) for k, v in ci_dict.items()}
        ev_zero = bool(self.ev_includes_zero) if self.ev_includes_zero is not None else None
        return {
            "prior": round(self.prior, 6),
            "posterior": round(self.posterior, 6),
            "p_evidence": round(self.p_evidence, 6),
            "p_likelihood": round(self.p_likelihood, 6),
            "p_null": round(self.p_null, 6),
            "likelihoods": {k: round(v, 6) for k, v in self.likelihoods.items()},
            "evidence_values": {k: round(v, 4) for k, v in self.evidence_values.items()},
            "credibility_interval_95": [ci_dict["lower"], ci_dict["upper"]] if ci_dict else [None, None],
            "ci_breakdown": ci_dict,
            "ev_includes_zero": ev_zero,
            "hwm_recoveries": self.hwm_recoveries,
        }


class BayesEngine:
    """Stateless Bayesian evaluator for EA edge survival.

    Usage:
        engine = BayesEngine()
        result = engine.evaluate(
            fits={"max_drawdown": fit_result, "stagnation_days": fit_result},
            current_values={"max_drawdown": 450.0, "stagnation_days": 30},
            prior=0.55,
            hwm_recoveries=3,
            trades_pnl=[10, -5, 20, -3, ...]  # For credibility interval
        )
    """

    def compute_likelihood(self, fit: FitResult, current_value: float) -> float:
        """Compute P(B|A): probability of seeing this evidence IF the edge is alive.

        This is the survival function (1 - CDF) evaluated at current_value,
        i.e., the area to the right of the cursor in the distribution chart.
        """
        if not fit.passed or fit.distribution_name in ("empirical", "none"):
            # Fallback to empirical percentile
            if fit.empirical_percentiles:
                idx = np.searchsorted(fit.empirical_percentiles, current_value)
                pct = min(idx, 100)
                return max(1.0 - pct / 100.0, 0.001)  # Never exactly 0
            return 0.5  # No data → agnostic

        if fit.is_hybrid and fit.hybrid_data:
            from .distributions.hybrid import HybridFit
            hf = HybridFit.from_dict(fit.hybrid_data)
            cdf_val = float(hf.cdf(np.array([current_value]))[0])
            return max(1.0 - cdf_val, 0.001)

        # Standard parametric fit
        dist = getattr(sp_stats, fit.distribution_name)
        cdf_val = float(dist.cdf(current_value, *fit.params))
        return max(1.0 - cdf_val, 0.001)

    def compute_credibility_interval(
        self,
        trades_pnl: list[float],
        confidence: float = 0.95,
        min_trades: int = MIN_TRADES_FOR_CI,
    ) -> dict | None:
        """Compute the Bayesian credibility interval for the Expected Value (EV).

        Uses the posterior distribution of the mean (normal approximation
        for large N, t-distribution for small N).
        
        Returns a dict with all intermediate values for transparency.
        """
        if not trades_pnl or len(trades_pnl) < min_trades:
            return None  # Sentinel: insufficient data

        data = np.array(trades_pnl, dtype=float)
        n = len(data)
        mean = float(np.mean(data))
        std = float(np.std(data, ddof=1))
        sem = std / np.sqrt(n)

        if sem == 0:
            return {
                "lower": mean, "upper": mean,
                "n": n, "mean": round(mean, 4), "std": 0.0, "sem": 0.0,
                "t_crit": 0.0, "df": n - 1, "confidence": confidence,
            }

        # Use t-distribution for small samples
        alpha = 1.0 - confidence
        df = n - 1
        t_crit = float(sp_stats.t.ppf(1.0 - alpha / 2, df=df))

        lower = mean - t_crit * sem
        upper = mean + t_crit * sem

        return {
            "lower": round(lower, 4),
            "upper": round(upper, 4),
            "n": n,
            "mean": round(mean, 4),
            "std": round(std, 4),
            "sem": round(float(sem), 4),
            "t_crit": round(t_crit, 4),
            "df": df,
            "confidence": confidence,
        }

    def evaluate(
        self,
        fits: dict[str, FitResult],
        current_values: dict[str, float],
        prior: float = DEFAULT_PRIOR,
        hwm_recoveries: int = 0,
        trades_pnl: Optional[list[float]] = None,
        max_posterior: float = MAX_POSTERIOR,
        min_trades_ci: int = MIN_TRADES_FOR_CI,
        ci_confidence: float = 0.95,
    ) -> BayesResult:
        """Full Bayesian evaluation combining multiple evidence streams.

        P(A|B,C,...) = Product(P(xi|A)) * P(A) / P(B,C,...)
        Using Naive Bayes independence assumption.
        
        Prior is FIXED (user-configurable). All information enters
        through the evidence (likelihoods). No HWM bonus.
        """
        likelihoods: dict[str, float] = {}
        evidence_values: dict[str, float] = {}

        for metric_name, current_val in current_values.items():
            fit = fits.get(metric_name)
            if fit is None:
                continue

            lk = self.compute_likelihood(fit, current_val)
            likelihoods[metric_name] = lk
            evidence_values[metric_name] = current_val

        if not likelihoods:
            # No evidence at all — return prior unchanged
            ci = self.compute_credibility_interval(trades_pnl or [], confidence=ci_confidence)
            ev_zero = bool(ci["lower"] <= 0 <= ci["upper"]) if ci else None
            return BayesResult(
                prior=prior,
                posterior=prior,
                p_evidence=0.5,
                p_likelihood=1.0,
                p_null=0.5,
                likelihoods={},
                evidence_values={},
                ci_data=ci,
                ev_includes_zero=ev_zero,
                hwm_recoveries=hwm_recoveries,
            )

        # Naive Bayes: multiply all likelihoods
        product_likelihood_a = 1.0
        for lk in likelihoods.values():
            product_likelihood_a *= lk

        # P(B,C,...) under the null hypothesis (edge is dead, EV=0)
        # Under null: all metrics are equally likely → uniform → P(x|not A) ≈ constant
        # We use a conservative flat prior of 0.5 for each evidence under null
        product_likelihood_not_a = 0.5 ** len(likelihoods)

        # Bayes theorem
        numerator = product_likelihood_a * prior
        denominator = numerator + product_likelihood_not_a * (1.0 - prior)

        if denominator > 0:
            posterior = numerator / denominator
        else:
            posterior = prior

        posterior = max(min(posterior, max_posterior), 0.0001)

        # Credibility interval for EV
        ci = self.compute_credibility_interval(trades_pnl or [], confidence=ci_confidence, min_trades=min_trades_ci)
        if ci is None:
            ev_zero = None
        else:
            ev_zero = bool(ci["lower"] <= 0 <= ci["upper"])

        return BayesResult(
            prior=prior,
            posterior=posterior,
            p_evidence=denominator if denominator > 0 else 0.5,
            p_likelihood=product_likelihood_a,
            p_null=product_likelihood_not_a,
            likelihoods=likelihoods,
            evidence_values=evidence_values,
            ci_data=ci,
            ev_includes_zero=ev_zero,
            hwm_recoveries=hwm_recoveries,
        )

    @staticmethod
    def update_prior_after_hwm(current_prior: float) -> float:
        """Called when the EA recovers its HWM — rewards the prior."""
        return min(current_prior + PRIOR_REWARD, MAX_PRIOR)
