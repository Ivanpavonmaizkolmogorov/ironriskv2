"""Drawdown distributions — continuous, >= 0."""

from scipy import stats
import numpy as np

from . import register, DistributionCandidate


@register("drawdown_abs")
class LognormalDist(DistributionCandidate):
    name = "Lognormal"
    scipy_name = "lognorm"

    @staticmethod
    def fit(data: np.ndarray) -> tuple:
        # lognorm requires data > 0; scipy handles loc shift internally
        return stats.lognorm.fit(data, floc=0)

    @staticmethod
    def test(data: np.ndarray, params: tuple) -> tuple[float, float]:
        return stats.kstest(data, "lognorm", args=params)


@register("drawdown_abs")
class WeibullDist(DistributionCandidate):
    name = "Weibull"
    scipy_name = "weibull_min"

    @staticmethod
    def fit(data: np.ndarray) -> tuple:
        return stats.weibull_min.fit(data, floc=0)

    @staticmethod
    def test(data: np.ndarray, params: tuple) -> tuple[float, float]:
        return stats.kstest(data, "weibull_min", args=params)


@register("drawdown_abs")
class GammaDist(DistributionCandidate):
    name = "Gamma"
    scipy_name = "gamma"

    @staticmethod
    def fit(data: np.ndarray) -> tuple:
        return stats.gamma.fit(data, floc=0)

    @staticmethod
    def test(data: np.ndarray, params: tuple) -> tuple[float, float]:
        return stats.kstest(data, "gamma", args=params)


@register("drawdown_abs")
class ParetoDist(DistributionCandidate):
    name = "Pareto (Lomax)"
    scipy_name = "lomax"

    @staticmethod
    def fit(data: np.ndarray) -> tuple:
        return stats.lomax.fit(data, floc=0)

    @staticmethod
    def test(data: np.ndarray, params: tuple) -> tuple[float, float]:
        return stats.kstest(data, "lomax", args=params)


@register("drawdown_abs")
class HalfNormalDist(DistributionCandidate):
    name = "Half-Normal"
    scipy_name = "halfnorm"

    @staticmethod
    def fit(data: np.ndarray) -> tuple:
        return stats.halfnorm.fit(data, floc=0)

    @staticmethod
    def test(data: np.ndarray, params: tuple) -> tuple[float, float]:
        return stats.kstest(data, "halfnorm", args=params)


@register("drawdown_abs")
class ExponentialDist(DistributionCandidate):
    name = "Exponential"
    scipy_name = "expon"

    @staticmethod
    def fit(data: np.ndarray) -> tuple:
        return stats.expon.fit(data, floc=0)

    @staticmethod
    def test(data: np.ndarray, params: tuple) -> tuple[float, float]:
        return stats.kstest(data, "expon", args=params)

