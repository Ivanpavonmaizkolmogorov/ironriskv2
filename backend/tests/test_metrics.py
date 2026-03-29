"""Unit tests for the RiskEngine and all metrics."""

import pytest
from core.metrics.drawdown_metric import DrawdownMetric
from core.metrics.stagnation_days_metric import StagnationDaysMetric
from core.metrics.stagnation_trades_metric import StagnationTradesMetric
from core.metrics.consecutive_losses_metric import ConsecutiveLossesMetric
from core.risk_engine import RiskEngine


# --- Sample trade data ---

SAMPLE_TRADES = [
    {"pnl": 100.0, "exit_time": "2024-01-01 10:00:00"},
    {"pnl": -50.0, "exit_time": "2024-01-02 10:00:00"},
    {"pnl": -30.0, "exit_time": "2024-01-03 10:00:00"},
    {"pnl": 200.0, "exit_time": "2024-01-10 10:00:00"},
    {"pnl": -80.0, "exit_time": "2024-01-11 10:00:00"},
    {"pnl": -40.0, "exit_time": "2024-01-12 10:00:00"},
    {"pnl": -20.0, "exit_time": "2024-01-15 10:00:00"},
    {"pnl": 150.0, "exit_time": "2024-01-20 10:00:00"},
    {"pnl": 50.0, "exit_time": "2024-01-25 10:00:00"},
    {"pnl": -10.0, "exit_time": "2024-01-30 10:00:00"},
]


class TestDrawdownMetric:
    def test_compute_from_backtest(self):
        metric = DrawdownMetric()
        result = metric.compute_from_backtest(SAMPLE_TRADES)

        assert result["max_drawdown"] > 0
        assert result["mean_drawdown"] > 0
        assert result["std_drawdown"] >= 0
        assert result["percentile_90"] > 0

    def test_evaluate_live_normal(self):
        metric = DrawdownMetric()
        params = metric.compute_from_backtest(SAMPLE_TRADES)

        result = metric.evaluate_live({"current_drawdown": 10.0}, params)
        assert result.zone == "NORMAL"
        assert result.name == "drawdown"

    def test_evaluate_live_critical(self):
        metric = DrawdownMetric()
        params = metric.compute_from_backtest(SAMPLE_TRADES)

        # Use a very large drawdown to trigger CRITICAL
        result = metric.evaluate_live({"current_drawdown": 99999.0}, params)
        assert result.zone == "CRITICAL"

    def test_empty_trades(self):
        metric = DrawdownMetric()
        result = metric.compute_from_backtest([])
        assert result["max_drawdown"] == 0.0


class TestConsecutiveLossesMetric:
    def test_compute_from_backtest(self):
        metric = ConsecutiveLossesMetric()
        result = metric.compute_from_backtest(SAMPLE_TRADES)

        # We have streaks of 2 and 3 consecutive losses
        assert result["max_consecutive_losses"] == 3

    def test_evaluate_live(self):
        metric = ConsecutiveLossesMetric()
        params = metric.compute_from_backtest(SAMPLE_TRADES)

        result = metric.evaluate_live({"consecutive_losses": 1}, params)
        assert result.zone in ("NORMAL", "WARNING", "CRITICAL")


class TestStagnationTradesMetric:
    def test_compute_from_backtest(self):
        metric = StagnationTradesMetric()
        result = metric.compute_from_backtest(SAMPLE_TRADES)

        assert result["max_stagnation_trades"] > 0

    def test_empty_trades(self):
        metric = StagnationTradesMetric()
        result = metric.compute_from_backtest([])
        assert result["max_stagnation_trades"] == 0


class TestRiskEngine:
    def test_create_default(self):
        engine = RiskEngine.create_default()
        assert len(engine._metrics) == 6

    def test_analyze_backtest(self):
        engine = RiskEngine.create_default()
        params = engine.analyze_backtest(SAMPLE_TRADES)

        assert "DrawdownMetric" in params
        assert "ConsecutiveLossesMetric" in params
        assert "StagnationDaysMetric" in params
        assert "StagnationTradesMetric" in params
        assert "PnlMetric" in params
        assert "DailyLossMetric" in params

    def test_build_live_response(self):
        engine = RiskEngine.create_default()
        params = engine.analyze_backtest(SAMPLE_TRADES)

        live_data = {
            "current_drawdown": 50.0,
            "current_pnl": -50.0,
            "consecutive_losses": 2,
            "stagnation_days": 5,
            "stagnation_trades": 3,
        }
        response = engine.build_live_response(live_data, params)

        assert response["status"] in ("NORMAL", "WARNING", "CRITICAL")
        assert "metrics" in response
        assert "floor_level" in response
        assert "ceiling_level" in response
        assert len(response["metrics"]) == 6

    def test_worst_zone(self):
        engine = RiskEngine.create_default()
        params = engine.analyze_backtest(SAMPLE_TRADES)

        # Very extreme values — should hit CRITICAL
        live_data = {
            "current_drawdown": 999999.0,
            "consecutive_losses": 999,
            "stagnation_days": 999,
            "stagnation_trades": 999,
        }
        results = engine.evaluate_live(live_data, params)
        assert engine.get_worst_zone(results) == "CRITICAL"
