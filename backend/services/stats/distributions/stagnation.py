"""Stagnation distributions — continuous, >= 0.

Stagnation (trades/days without new equity high) is a waiting-time variable.
Exponential and Gamma are natural fits for "time until event" processes.
"""

from scipy import stats
import numpy as np

from . import register, DistributionCandidate


@register("stagnation")
class ExponentialDist(DistributionCandidate):
    name = "Exponential"
    scipy_name = "expon"

    @staticmethod
    def fit(data: np.ndarray) -> tuple:
        # expon.fit returns (loc, scale); scale = mean for exponential
        return stats.expon.fit(data, floc=0)

    @staticmethod
    def test(data: np.ndarray, params: tuple) -> tuple[float, float]:
        return stats.kstest(data, "expon", args=params)


@register("stagnation")
class GammaDist(DistributionCandidate):
    name = "Gamma"
    scipy_name = "gamma"

    @staticmethod
    def fit(data: np.ndarray) -> tuple:
        # gamma.fit returns (a, loc, scale); a=shape
        return stats.gamma.fit(data, floc=0)

    @staticmethod
    def test(data: np.ndarray, params: tuple) -> tuple[float, float]:
        return stats.kstest(data, "gamma", args=params)


@register("stagnation")
class WeibullDist(DistributionCandidate):
    name = "Weibull"
    scipy_name = "weibull_min"

    @staticmethod
    def fit(data: np.ndarray) -> tuple:
        return stats.weibull_min.fit(data, floc=0)

    @staticmethod
    def test(data: np.ndarray, params: tuple) -> tuple[float, float]:
        return stats.kstest(data, "weibull_min", args=params)


@register("stagnation")
class InverseGaussianDist(DistributionCandidate):
    name = "Wald (Inst. Gaussian)"
    scipy_name = "invgauss"

    @staticmethod
    def fit(data: np.ndarray) -> tuple:
        return stats.invgauss.fit(data, floc=0)

    @staticmethod
    def test(data: np.ndarray, params: tuple) -> tuple[float, float]:
        return stats.kstest(data, "invgauss", args=params)

