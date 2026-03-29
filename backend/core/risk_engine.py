"""RiskEngine — Orchestrator that registers and runs all metrics."""

from typing import Dict, List

from .metrics.base_metric import BaseMetric, MetricResult
from .metrics.drawdown_metric import DrawdownMetric
from .metrics.stagnation_days_metric import StagnationDaysMetric
from .metrics.stagnation_trades_metric import StagnationTradesMetric
from .metrics.consecutive_losses_metric import ConsecutiveLossesMetric
from .metrics.pnl_metric import PnlMetric
from .metrics.daily_loss_metric import DailyLossMetric


class RiskEngine:
    """Central orchestrator for all risk metrics.

    Follows the Strategy Pattern: metrics are interchangeable objects
    registered at runtime. The engine iterates them polymorphically.
    """

    def __init__(self) -> None:
        self._metrics: List[BaseMetric] = []

    def register_metric(self, metric: BaseMetric) -> None:
        """Register a new metric to the engine."""
        self._metrics.append(metric)

    @classmethod
    def create_default(cls) -> "RiskEngine":
        """Factory: creates an engine pre-loaded with the 5 core metrics."""
        engine = cls()
        engine.register_metric(DrawdownMetric())
        engine.register_metric(StagnationDaysMetric())
        engine.register_metric(StagnationTradesMetric())
        engine.register_metric(ConsecutiveLossesMetric())
        engine.register_metric(PnlMetric())
        engine.register_metric(DailyLossMetric())
        return engine

    def analyze_backtest(self, trades: List[dict]) -> Dict[str, dict]:
        """Process full CSV → returns statistical params per metric.

        These params are persisted in the DB and later used
        by evaluate_live() for real-time comparison.
        """
        return {
            type(m).__name__: m.compute_from_backtest(trades)
            for m in self._metrics
        }

    def evaluate_live(
        self, live_data: dict, backtest_params: Dict[str, dict]
    ) -> List[MetricResult]:
        """Evaluate live PnL data against each registered metric."""
        results: List[MetricResult] = []
        for metric in self._metrics:
            key = type(metric).__name__
            if key in backtest_params:
                results.append(metric.evaluate_live(live_data, backtest_params[key]))
        return results

    def get_worst_zone(self, results: List[MetricResult]) -> str:
        """Return the most severe zone across all metric results."""
        zone_severity = {"NORMAL": 0, "WARNING": 1, "CRITICAL": 2}
        if not results:
            return "NORMAL"
        worst = max(results, key=lambda r: zone_severity.get(r.zone, 0))
        return worst.zone

    def build_live_response(
        self, live_data: dict, backtest_params: Dict[str, dict]
    ) -> dict:
        """Full pipeline: evaluate + build the JSON response for the EA."""
        results = self.evaluate_live(live_data, backtest_params)
        overall_zone = self.get_worst_zone(results)
        
        # Override for old MT5 EA versions: they paint a hardcoded "CRITICAL" text
        # To just erase it, we send "BREACHED" which defaults to the regular gray UI
        ea_status = "BREACHED" if overall_zone == "CRITICAL" else overall_zone

        # Find floor/ceiling from drawdown metric
        dd_result = next((r for r in results if r.name == "drawdown"), None)

        return {
            "status": ea_status,
            "metrics": [
                {
                    "name": r.name,
                    "value": r.value,
                    "zone": r.zone,
                    "percentile": round(r.percentile, 1),
                    "threshold_warning": round(r.threshold_warning, 2),
                    "threshold_critical": round(r.threshold_critical, 2),
                }
                for r in results
            ],
            "floor_level": round(-dd_result.threshold_critical, 2) if dd_result else 0.0,
            "ceiling_level": round(-dd_result.threshold_warning, 2) if dd_result else 0.0,
        }
