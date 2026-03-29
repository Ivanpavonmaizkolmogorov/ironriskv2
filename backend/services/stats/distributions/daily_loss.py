"""Daily Loss distributions — continuous, can be negative."""

from scipy import stats
import numpy as np

from . import register, DistributionCandidate


@register("daily_loss")
class NormalDist(DistributionCandidate):
    name = "Normal"
    scipy_name = "norm"

    @staticmethod
    def fit(data: np.ndarray) -> tuple:
        return stats.norm.fit(data)

    @staticmethod
    def test(data: np.ndarray, params: tuple) -> tuple[float, float]:
        return stats.kstest(data, "norm", args=params)


@register("daily_loss")
class TStudentDist(DistributionCandidate):
    name = "t-Student"
    scipy_name = "t"

    @staticmethod
    def fit(data: np.ndarray) -> tuple:
        return stats.t.fit(data)

    @staticmethod
    def test(data: np.ndarray, params: tuple) -> tuple[float, float]:
        return stats.kstest(data, "t", args=params)


@register("daily_loss")
class LaplaceDist(DistributionCandidate):
    name = "Laplace"
    scipy_name = "laplace"

    @staticmethod
    def fit(data: np.ndarray) -> tuple:
        return stats.laplace.fit(data)

    @staticmethod
    def test(data: np.ndarray, params: tuple) -> tuple[float, float]:
        return stats.kstest(data, "laplace", args=params)


@register("daily_loss")
class LogisticDist(DistributionCandidate):
    name = "Logistic"
    scipy_name = "logistic"

    @staticmethod
    def fit(data: np.ndarray) -> tuple:
        return stats.logistic.fit(data)

    @staticmethod
    def test(data: np.ndarray, params: tuple) -> tuple[float, float]:
        return stats.kstest(data, "logistic", args=params)
