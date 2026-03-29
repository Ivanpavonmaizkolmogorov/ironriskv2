"""Metric Registry — auto-registration of risk metrics.

Each metric class decorates itself with ``@register_metric``
so the ``DistributionAnalyzer`` discovers them automatically.
"""

from __future__ import annotations

from .base import RiskMetric

METRIC_REGISTRY: list[type[RiskMetric]] = []


def register_metric(cls: type[RiskMetric]):
    """Class decorator — registers a risk metric."""
    METRIC_REGISTRY.append(cls)
    return cls
