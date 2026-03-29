"""RiskProfile — Determines risk status (Shield vs Statistical) for each metric."""

from dataclasses import dataclass
from typing import Optional

from .fit_result import FitResult


@dataclass
class RiskContext:
    """Context sent to the EA for display on the dashboard."""
    percentile: Optional[int]
    label: str
    color: str  # "green", "yellow", "red"


class ShieldMode:
    """Fallback mode when no backtest data is available. 
    Returns simple % of limit.
    """
    def __init__(self, limits: dict):
        self.limits = limits

    def get_context(self, metric_name: str, current: float) -> RiskContext:
        limit_config = self.limits.get(metric_name, {})
        limit = limit_config.get("limit", 0)
        enabled = limit_config.get("enabled", False)
        
        if not enabled or limit <= 0:
            return RiskContext(percentile=None, label="Metric disabled", color="gray")

        pct_used = (current / limit * 100) if limit > 0 else 0
        if pct_used < 60:
            color = "green"
        elif pct_used < 85:
            color = "yellow"
        else:
            color = "red"
            
        return RiskContext(
            percentile=None, 
            label=f"Basic Rule: {pct_used:.0f}% usage", 
            color=color
        )


class StatisticalMode:
    """Data-driven mode computing exact percentiles based on backtest fit (or empirical)."""
    def __init__(self, fit: FitResult, limits: dict):
        self.fit = fit
        self.limits = limits

    def get_context(self, metric_name: str, current: float) -> RiskContext:
        limit_config = self.limits.get(metric_name, {})
        enabled = limit_config.get("enabled", False)
        
        if not enabled:
            return RiskContext(percentile=None, label="Metric disabled", color="gray")

        pct = self.fit.percentile(current)
        
        
        if pct <= 50:
            label, color = "Statistical Risk: Normal", "green"
        elif pct <= 80:
            label, color = "Statistical Risk: Elevated", "yellow"
        else:
            label, color = "Statistical Risk: Extreme", "red"
            
        return RiskContext(percentile=pct, label=label, color=color)


class RiskProfile:
    """Orchestrates risk evaluation for all metrics of a strategy."""
    
    def __init__(self, strategy):
        self.strategy = strategy
        self.fits = getattr(strategy, "distribution_fit", None) or {}
        self.limits = getattr(strategy, "risk_config", None) or {}

    def get_context_for_metric(self, metric_name: str, current: float) -> RiskContext:
        """Evaluates a single metric dynamically choosing Shield vs Statistical mode."""
        fit_dict = self.fits.get(metric_name)
        
        if fit_dict and (fit_dict.get("passed") or fit_dict.get("distribution_name") == "empirical"):
            # We have backtest data for this metric (even if empirical)
            fit = FitResult.from_dict(fit_dict)
            
            mode = StatisticalMode(fit, self.limits)
        else:
            # Fallback to Shield Mode (no CSV uploaded or metric skipped)
            mode = ShieldMode(self.limits)
        
        return mode.get_context(metric_name, current)

    def evaluate_heartbeat(self, current_metrics: dict) -> dict[str, dict]:
        """Evaluates all current metrics from a heartbeat.
        
        Expected current_metrics dict:
        { "max_drawdown": 450.0, "pnl_per_trade": -120.0, ... }
        """
        results = {}
        for metric_name, current_val in current_metrics.items():
            ctx = self.get_context_for_metric(metric_name, current_val)
            results[metric_name] = {
                "percentile": ctx.percentile,
                "label": ctx.label,
                "color": ctx.color
            }
        return results

    @classmethod
    def from_strategy(cls, strategy) -> "RiskProfile":
        return cls(strategy)
