"""Count distributions — discrete, >= 0.

Uses chi-squared goodness-of-fit test instead of KS,
which is more appropriate for discrete distributions.
"""

from scipy import stats
from scipy.stats import chisquare
import numpy as np

from . import register, DistributionCandidate


def _chi2_discrete_test(data: np.ndarray, dist, params: tuple, max_bins: int = 20):
    """Chi-squared goodness-of-fit test for discrete distributions.

    Groups data into bins, computes observed vs expected frequencies,
    and returns (statistic, p_value) like kstest.
    """
    data_int = data.astype(int)
    # Observed frequency table
    max_val = min(int(data_int.max()), max_bins)
    observed = np.zeros(max_val + 1)
    for v in data_int:
        idx = min(int(v), max_val)
        observed[idx] += 1

    # Expected frequencies from the distribution
    n = len(data)
    expected = np.array([dist.pmf(k, *params) * n for k in range(max_val + 1)])

    # Pool bins with expected < 5 (chi-squared requirement)
    pooled_obs, pooled_exp = [], []
    cum_obs, cum_exp = 0.0, 0.0
    for o, e in zip(observed, expected):
        cum_obs += o
        cum_exp += e
        if cum_exp >= 5:
            pooled_obs.append(cum_obs)
            pooled_exp.append(cum_exp)
            cum_obs, cum_exp = 0.0, 0.0
    # Add any remainder to the last bin
    if cum_obs > 0 or cum_exp > 0:
        if pooled_obs:
            pooled_obs[-1] += cum_obs
            pooled_exp[-1] += cum_exp
        else:
            pooled_obs.append(cum_obs)
            pooled_exp.append(max(cum_exp, 0.01))

    if len(pooled_obs) < 2:
        return 0.0, 0.0  # Not enough bins to test

    stat, p_value = chisquare(pooled_obs, f_exp=pooled_exp)
    return float(stat), float(p_value)


@register("consecutive_losses")
@register("stagnation")
class GeometricDist(DistributionCandidate):
    name = "Geometric"
    scipy_name = "geom"

    @staticmethod
    def fit(data: np.ndarray) -> tuple:
        mean_val = max(np.mean(data), 1.0)
        p = 1.0 / mean_val
        return (p,)

    @staticmethod
    def test(data: np.ndarray, params: tuple) -> tuple[float, float]:
        return _chi2_discrete_test(data, stats.geom, params)


@register("consecutive_losses")
@register("stagnation")
class PoissonDist(DistributionCandidate):
    name = "Poisson"
    scipy_name = "poisson"

    @staticmethod
    def fit(data: np.ndarray) -> tuple:
        mu = max(np.mean(data), 0.01)
        return (mu,)

    @staticmethod
    def test(data: np.ndarray, params: tuple) -> tuple[float, float]:
        return _chi2_discrete_test(data, stats.poisson, params)


@register("consecutive_losses")
@register("stagnation")
class NegBinomialDist(DistributionCandidate):
    name = "Negative Binomial"
    scipy_name = "nbinom"

    @staticmethod
    def fit(data: np.ndarray) -> tuple:
        mean_val = max(np.mean(data), 0.01)
        var_val = max(np.var(data), mean_val + 0.01)
        n = mean_val ** 2 / (var_val - mean_val)
        p = mean_val / var_val
        return (max(n, 0.5), min(max(p, 0.01), 0.99))

    @staticmethod
    def test(data: np.ndarray, params: tuple) -> tuple[float, float]:
        return _chi2_discrete_test(data, stats.nbinom, params)
