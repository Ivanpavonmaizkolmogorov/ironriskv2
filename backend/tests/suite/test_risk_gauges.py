"""
Risk Gauge regression tests.

Covers: max_drawdown, stagnation_trades, stagnation_days, consecutive_losses, daily_loss.

The RiskGaugeEvaluator has two arbitrators:
  1. Statistical (Bayesian): compares percentile against p_amber / p_red thresholds.
  2. Physical (Ulysses Pact): if current_value >= configured hard limit → "fatal".

Test taxonomy:
  - Green zone: value well below the distribution median → green status
  - Amber zone: value above p_amber threshold → amber
  - Red zone:   value above p_red threshold → red
  - Fatal zone: value >= physical limit → fatal (overrides statistics)
  - No fit:     no distribution available → percentile=0, status=green (safe default)
  - Simulated:  is_simulated=True flag is forwarded correctly
  - Monotonicity: higher current_value → higher percentile (not lower)
"""
from __future__ import annotations

import numpy as np
from .base import TestResult, run_test

GROUP = "risk_gauges"

# ── Helpers ──────────────────────────────────────────────────────────────────

def _make_normal_fit(metric_name: str, mean: float, std: float) -> dict:
    """Build a FitResult dict for a Normal distribution (easy to reason about)."""
    from scipy.stats import norm
    params = list(norm.fit(np.random.default_rng(42).normal(mean, std, 500)))
    return {
        "metric_name": metric_name,
        "distribution_name": "norm",
        "params": params,
        "p_value": 0.42,
        "passed": True,
        "is_hybrid": False,
        "empirical_percentiles": np.percentile(
            np.random.default_rng(42).normal(mean, std, 500),
            np.arange(101)
        ).tolist(),
    }


def _make_empirical_fit(metric_name: str, data: list[float]) -> dict:
    """Build a FitResult dict using empirical percentiles only."""
    return {
        "metric_name": metric_name,
        "distribution_name": "empirical",
        "params": [],
        "p_value": 0.0,
        "passed": False,
        "is_hybrid": False,
        "empirical_percentiles": np.percentile(data, np.arange(101)).tolist(),
    }


def _evaluator(risk_config: dict = None):
    from services.stats.bayes_engine import BayesEngine
    from services.stats.gauge_evaluator import RiskGaugeEvaluator
    engine = BayesEngine()
    return RiskGaugeEvaluator(engine, risk_config or {})


# ── Drawdown tests ────────────────────────────────────────────────────────────

def test_dd_green_when_value_low() -> TestResult:
    """DD at 10th percentile of its distribution → status=green."""
    fit = _make_normal_fit("max_drawdown", mean=500, std=100)
    low_dd = 350.0   # well below mean, ~8th percentile
    cfg = {"max_drawdown": {"p_amber": 85, "p_red": 95, "enabled": False, "limit": 0}}
    result = _evaluator(cfg).evaluate("max_drawdown", low_dd, fit)

    passed = result["status"] == "green" and result["percentile"] < 50
    return TestResult(
        name="dd_green_when_value_low",
        group=GROUP,
        passed=passed,
        expected="status=green, percentile<50",
        actual=f"status={result['status']}, percentile={result['percentile']}"
    )


def test_dd_amber_when_value_high() -> TestResult:
    """DD at 90th percentile → amber (between p_amber=85 and p_red=95)."""
    fit = _make_normal_fit("max_drawdown", mean=500, std=100)
    high_dd = 630.0  # ~90th pct of N(500,100)
    cfg = {"max_drawdown": {"p_amber": 85, "p_red": 95, "enabled": False, "limit": 0}}
    result = _evaluator(cfg).evaluate("max_drawdown", high_dd, fit)

    passed = result["status"] == "amber"
    return TestResult(
        name="dd_amber_when_value_high",
        group=GROUP,
        passed=passed,
        expected="status=amber (pct ~90, amber=85, red=95)",
        actual=f"status={result['status']}, percentile={result['percentile']}"
    )


def test_dd_red_when_value_extreme() -> TestResult:
    """DD at 99th percentile → red (above p_red=95)."""
    fit = _make_normal_fit("max_drawdown", mean=500, std=100)
    extreme_dd = 750.0  # ~99th pct of N(500,100)
    cfg = {"max_drawdown": {"p_amber": 85, "p_red": 95, "enabled": False, "limit": 0}}
    result = _evaluator(cfg).evaluate("max_drawdown", extreme_dd, fit)

    passed = result["status"] == "red" and result["percentile"] >= 95
    return TestResult(
        name="dd_red_when_value_extreme",
        group=GROUP,
        passed=passed,
        expected="status=red, percentile>=95",
        actual=f"status={result['status']}, percentile={result['percentile']}"
    )


def test_dd_fatal_when_limit_breached() -> TestResult:
    """DD >= physical limit → status=fatal, regardless of statistical percentile."""
    fit = _make_normal_fit("max_drawdown", mean=500, std=100)
    cfg = {"max_drawdown": {"p_amber": 85, "p_red": 95, "enabled": True, "limit": 1000}}
    # Value is statistically at median (50th pct) but breaches physical limit
    result = _evaluator(cfg).evaluate("max_drawdown", 1000.0, fit)

    passed = result["status"] == "fatal" and result["limit_breached"] is True
    return TestResult(
        name="dd_fatal_when_limit_breached",
        group=GROUP,
        passed=passed,
        expected="status=fatal, limit_breached=True",
        actual=f"status={result['status']}, limit_breached={result['limit_breached']}"
    )


def test_dd_not_fatal_when_limit_disabled() -> TestResult:
    """Physical limit NOT triggered when enabled=False, even if value >= limit."""
    fit = _make_normal_fit("max_drawdown", mean=500, std=100)
    cfg = {"max_drawdown": {"p_amber": 85, "p_red": 95, "enabled": False, "limit": 100}}
    result = _evaluator(cfg).evaluate("max_drawdown", 5000.0, fit)

    passed = result["status"] != "fatal"
    return TestResult(
        name="dd_not_fatal_when_limit_disabled",
        group=GROUP,
        passed=passed,
        expected="status != fatal (limit disabled)",
        actual=f"status={result['status']}"
    )


# ── Stagnation tests ──────────────────────────────────────────────────────────

def test_stagnation_trades_green() -> TestResult:
    """Small stagnation in trades relative to historical → green."""
    data = list(range(10, 200, 5))  # typical stagnation trades values
    fit = _make_empirical_fit("stagnation_trades", data)
    cfg = {"stagnation_trades": {"p_amber": 85, "p_red": 95, "enabled": False, "limit": 0}}
    result = _evaluator(cfg).evaluate("stagnation_trades", 15.0, fit)

    passed = result["status"] == "green"
    return TestResult(
        name="stagnation_trades_green",
        group=GROUP,
        passed=passed,
        expected="status=green (15 trades stagnation is low)",
        actual=f"status={result['status']}, percentile={result['percentile']}"
    )


def test_stagnation_trades_red() -> TestResult:
    """Stagnation at max of historical distribution → red."""
    data = list(range(10, 100, 2))  # values 10..98
    fit = _make_empirical_fit("stagnation_trades", data)
    cfg = {"stagnation_trades": {"p_amber": 85, "p_red": 95, "enabled": False, "limit": 0}}
    result = _evaluator(cfg).evaluate("stagnation_trades", 200.0, fit)  # beyond all history

    passed = result["status"] == "red"
    return TestResult(
        name="stagnation_trades_red",
        group=GROUP,
        passed=passed,
        expected="status=red (beyond historical max)",
        actual=f"status={result['status']}, percentile={result['percentile']}"
    )


def test_stagnation_days_fatal() -> TestResult:
    """Stagnation days >= configured limit → fatal."""
    fit = _make_normal_fit("stagnation_days", mean=30, std=10)
    cfg = {"stagnation_days": {"p_amber": 85, "p_red": 95, "enabled": True, "limit": 90}}
    result = _evaluator(cfg).evaluate("stagnation_days", 90.0, fit)

    passed = result["status"] == "fatal"
    return TestResult(
        name="stagnation_days_fatal",
        group=GROUP,
        passed=passed,
        expected="status=fatal (90 >= limit 90)",
        actual=f"status={result['status']}, limit_breached={result['limit_breached']}"
    )


# ── Consecutive losses tests ──────────────────────────────────────────────────

def test_consec_losses_green_small_streak() -> TestResult:
    """A streak of 3 losses from a distribution where streaks of 20 are common → green."""
    data = list(range(1, 30))  # typical streaks 1-29
    fit = _make_empirical_fit("consecutive_losses", data)
    cfg = {"consecutive_losses": {"p_amber": 85, "p_red": 95, "enabled": False, "limit": 0}}
    result = _evaluator(cfg).evaluate("consecutive_losses", 3.0, fit)

    passed = result["status"] == "green"
    return TestResult(
        name="consec_losses_green_small_streak",
        group=GROUP,
        passed=passed,
        expected="status=green",
        actual=f"status={result['status']}, percentile={result['percentile']}"
    )


def test_consec_losses_red_extreme_streak() -> TestResult:
    """An extreme streak beyond 99th pct of history → red."""
    data = [float(x) for x in range(1, 21)]  # streaks 1..20
    fit = _make_empirical_fit("consecutive_losses", data)
    cfg = {"consecutive_losses": {"p_amber": 85, "p_red": 95, "enabled": False, "limit": 0}}
    result = _evaluator(cfg).evaluate("consecutive_losses", 25.0, fit)  # beyond all history

    passed = result["status"] == "red"
    return TestResult(
        name="consec_losses_red_extreme_streak",
        group=GROUP,
        passed=passed,
        expected="status=red (25 > max hist 20)",
        actual=f"status={result['status']}, percentile={result['percentile']}"
    )


# ── No-fit / edge-case tests ──────────────────────────────────────────────────

def test_no_fit_defaults_to_green() -> TestResult:
    """When fit_dict=None, gauge must not crash and must return status=green, percentile=0."""
    cfg = {"max_drawdown": {"p_amber": 85, "p_red": 95, "enabled": False, "limit": 0}}
    result = _evaluator(cfg).evaluate("max_drawdown", 999.0, None)

    passed = result["status"] == "green" and result["percentile"] == 0.0
    return TestResult(
        name="no_fit_defaults_to_green",
        group=GROUP,
        passed=passed,
        expected="status=green, percentile=0.0",
        actual=f"status={result['status']}, percentile={result['percentile']}"
    )


def test_result_keys_always_present() -> TestResult:
    """Gauge result must always contain: current, percentile, status, simulated, limit_breached, limit."""
    REQUIRED = {"current", "percentile", "status", "simulated", "limit_breached", "limit"}
    fit = _make_normal_fit("max_drawdown", mean=500, std=100)
    result = _evaluator().evaluate("max_drawdown", 500.0, fit)

    missing = REQUIRED - set(result.keys())
    passed = len(missing) == 0
    return TestResult(
        name="result_keys_always_present",
        group=GROUP,
        passed=passed,
        expected=f"Keys: {sorted(REQUIRED)}",
        actual=f"Missing: {sorted(missing)}" if missing else f"All present: {sorted(result.keys())}"
    )


def test_simulated_flag_forwarded() -> TestResult:
    """is_simulated=True must be reflected as simulated=True in the output."""
    fit = _make_normal_fit("max_drawdown", mean=500, std=100)
    result = _evaluator().evaluate("max_drawdown", 500.0, fit, is_simulated=True)

    passed = result["simulated"] is True
    return TestResult(
        name="simulated_flag_forwarded",
        group=GROUP,
        passed=passed,
        expected="simulated=True",
        actual=f"simulated={result['simulated']}"
    )


def test_percentile_monotonic_with_value() -> TestResult:
    """Higher current_value → higher percentile (monotonic). Critical math invariant."""
    fit = _make_normal_fit("max_drawdown", mean=500, std=100)
    evaluator = _evaluator()

    values = [200, 350, 500, 600, 700, 800]
    percentiles = [evaluator.evaluate("max_drawdown", v, fit)["percentile"] for v in values]

    # Each percentile must be >= previous
    violations = [
        (values[i], values[i+1], percentiles[i], percentiles[i+1])
        for i in range(len(percentiles) - 1)
        if percentiles[i+1] < percentiles[i]
    ]
    passed = len(violations) == 0
    return TestResult(
        name="percentile_monotonic_with_value",
        group=GROUP,
        passed=passed,
        expected=f"Monotonic: {list(zip(values, percentiles))}",
        actual=f"Violations: {violations}" if violations else "None — strictly monotonic"
    )


def test_daily_loss_gauge_structure() -> TestResult:
    """daily_loss gauge returns valid structure with correct current value."""
    fit = _make_normal_fit("daily_loss", mean=200, std=50)
    cfg = {"daily_loss": {"p_amber": 80, "p_red": 95, "enabled": True, "limit": 500}}
    result = _evaluator(cfg).evaluate("daily_loss", 210.0, fit)

    passed = (
        isinstance(result["current"], float)
        and abs(result["current"] - 210.0) < 0.01
        and result["status"] in {"green", "amber", "red", "fatal"}
    )
    return TestResult(
        name="daily_loss_gauge_structure",
        group=GROUP,
        passed=passed,
        expected="current=210.0, status in {green,amber,red,fatal}",
        actual=f"current={result['current']}, status={result['status']}"
    )


# ── Runner ────────────────────────────────────────────────────────────────────

def run_group() -> list[TestResult]:
    return [
        run_test("dd_green_when_value_low", GROUP, test_dd_green_when_value_low),
        run_test("dd_amber_when_value_high", GROUP, test_dd_amber_when_value_high),
        run_test("dd_red_when_value_extreme", GROUP, test_dd_red_when_value_extreme),
        run_test("dd_fatal_when_limit_breached", GROUP, test_dd_fatal_when_limit_breached),
        run_test("dd_not_fatal_when_limit_disabled", GROUP, test_dd_not_fatal_when_limit_disabled),
        run_test("stagnation_trades_green", GROUP, test_stagnation_trades_green),
        run_test("stagnation_trades_red", GROUP, test_stagnation_trades_red),
        run_test("stagnation_days_fatal", GROUP, test_stagnation_days_fatal),
        run_test("consec_losses_green_small_streak", GROUP, test_consec_losses_green_small_streak),
        run_test("consec_losses_red_extreme_streak", GROUP, test_consec_losses_red_extreme_streak),
        run_test("no_fit_defaults_to_green", GROUP, test_no_fit_defaults_to_green),
        run_test("result_keys_always_present", GROUP, test_result_keys_always_present),
        run_test("simulated_flag_forwarded", GROUP, test_simulated_flag_forwarded),
        run_test("percentile_monotonic_with_value", GROUP, test_percentile_monotonic_with_value),
        run_test("daily_loss_gauge_structure", GROUP, test_daily_loss_gauge_structure),
    ]
