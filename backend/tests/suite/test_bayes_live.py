"""
Bayesian Engine — Live Trades injection tests.
Validates that injecting live trades correctly updates the posterior:
  - Winning live trades increase P(EV>0)
  - Losing live trades decrease P(EV>0)
  - 0 live trades = BT-only result (unchanged)
  - Extreme losing streak is detected by consistency tests
"""
from __future__ import annotations
from pathlib import Path
from .base import TestResult, run_test

GROUP = "bayes_live"

DEMO_CSV = Path(__file__).parent.parent / "fixtures" / "demo_backtest.csv"


def _get_demo_pnl() -> list[float]:
    from services.csv_parser import parse_csv
    content = DEMO_CSV.read_bytes()
    trades, _ = parse_csv(content, filename="demo_backtest.csv")
    return [t["pnl"] for t in trades]


def _decompose(bt_pnl, live_pnl=None, bt_discount=20.0):
    from services.stats.bayes_engine import BayesEngine
    engine = BayesEngine()
    return engine.decompose_ev(
        bt_pnl=bt_pnl,
        live_pnl=live_pnl or [],
        bt_discount=bt_discount,
        confidence=0.95,
        min_trades=0,
        max_bt_trades=None,
    )


def test_zero_live_equals_bt_only() -> TestResult:
    """P(EV>0) with 0 live trades must equal P(EV>0) with no live argument."""
    pnl = _get_demo_pnl()
    d_no_live = _decompose(pnl, live_pnl=None)
    d_zero_live = _decompose(pnl, live_pnl=[])
    if not d_no_live or not d_zero_live:
        return TestResult(
            name="zero_live_equals_bt_only", group=GROUP, passed=False,
            expected="Both decomps valid", actual="One returned None"
        )
    passed = abs(d_no_live.p_positive - d_zero_live.p_positive) < 1e-6
    return TestResult(
        name="zero_live_equals_bt_only",
        group=GROUP,
        passed=passed,
        expected=f"P equal (diff < 1e-6)",
        actual=f"diff = {abs(d_no_live.p_positive - d_zero_live.p_positive):.8f}"
    )


def test_winning_live_trades_increase_p_positive() -> TestResult:
    """Adding 50 profitable live trades should push P(EV>0) higher."""
    pnl = _get_demo_pnl()
    d_bt = _decompose(pnl)
    winning_live = [120.0, 95.0, 110.0, 140.0, 88.0] * 10  # 50 wins
    d_live = _decompose(pnl, live_pnl=winning_live)
    if not d_bt or not d_live:
        return TestResult(
            name="winning_live_trades_increase_p_positive", group=GROUP, passed=False,
            expected="Both valid", actual="None"
        )
    passed = d_live.p_positive >= d_bt.p_positive - 0.01  # can only go equal or higher
    return TestResult(
        name="winning_live_trades_increase_p_positive",
        group=GROUP,
        passed=passed,
        expected=f"P_live >= P_bt: {d_bt.p_positive*100:.1f}%",
        actual=f"P_live={d_live.p_positive*100:.1f}% | P_bt={d_bt.p_positive*100:.1f}%"
    )


def test_losing_live_trades_decrease_p_positive() -> TestResult:
    """Adding 50 losing live trades should push P(EV>0) lower."""
    pnl = _get_demo_pnl()
    d_bt = _decompose(pnl)
    losing_live = [-120.0, -95.0, -110.0, -140.0, -88.0] * 10  # 50 losses
    d_live = _decompose(pnl, live_pnl=losing_live)
    if not d_bt or not d_live:
        return TestResult(
            name="losing_live_trades_decrease_p_positive", group=GROUP, passed=False,
            expected="Both valid", actual="None"
        )
    passed = d_live.p_positive <= d_bt.p_positive + 0.01
    return TestResult(
        name="losing_live_trades_decrease_p_positive",
        group=GROUP,
        passed=passed,
        expected=f"P_live <= P_bt: {d_bt.p_positive*100:.1f}%",
        actual=f"P_live={d_live.p_positive*100:.1f}% | P_bt={d_bt.p_positive*100:.1f}%"
    )


def test_live_win_rate_tracked() -> TestResult:
    """EVDecomposition.live_win_rate must be set correctly when live trades exist."""
    pnl = _get_demo_pnl()
    # 10 wins, 5 losses → expected live win_rate ≈ 0.667
    live = [100.0] * 10 + [-80.0] * 5
    d = _decompose(pnl, live_pnl=live)
    if not d:
        return TestResult(
            name="live_win_rate_tracked", group=GROUP, passed=False,
            expected="Decomp valid", actual="None"
        )
    expected_wr = round(10 / 15, 4)
    actual_wr = d.live_win_rate
    passed = actual_wr is not None and abs(actual_wr - expected_wr) < 0.01
    return TestResult(
        name="live_win_rate_tracked",
        group=GROUP,
        passed=passed,
        expected=f"live_win_rate ≈ {expected_wr}",
        actual=str(actual_wr)
    )


def test_n_live_count() -> TestResult:
    """EVDecomposition.n_live must equal len(live_pnl)."""
    pnl = _get_demo_pnl()
    live = [50.0, -30.0, 70.0, -20.0, 90.0]
    d = _decompose(pnl, live_pnl=live)
    if not d:
        return TestResult(
            name="n_live_count", group=GROUP, passed=False,
            expected="5", actual="None"
        )
    passed = d.n_live == len(live)
    return TestResult(
        name="n_live_count",
        group=GROUP,
        passed=passed,
        expected=len(live),
        actual=d.n_live
    )


def test_extreme_losing_streak_detectable() -> TestResult:
    """
    After injecting a pathological losing streak live, blind_risk should be high.
    This tests the system can detect when live results diverge badly from backtest.
    """
    pnl = _get_demo_pnl()
    # 100 consecutive losses
    losing_streak = [-100.0] * 100
    d = _decompose(pnl, live_pnl=losing_streak)
    if not d:
        return TestResult(
            name="extreme_losing_streak_detectable", group=GROUP, passed=False,
            expected="Decomp valid", actual="None"
        )
    # With 100 consecutive losses, blind_risk must rise significantly
    passed = d.blind_risk > 30.0
    return TestResult(
        name="extreme_losing_streak_detectable",
        group=GROUP,
        passed=passed,
        expected="blind_risk > 30%",
        actual=f"blind_risk = {d.blind_risk}%"
    )


def run_group() -> list[TestResult]:
    return [
        run_test("zero_live_equals_bt_only", GROUP, test_zero_live_equals_bt_only),
        run_test("winning_live_trades_increase_p_positive", GROUP, test_winning_live_trades_increase_p_positive),
        run_test("losing_live_trades_decrease_p_positive", GROUP, test_losing_live_trades_decrease_p_positive),
        run_test("live_win_rate_tracked", GROUP, test_live_win_rate_tracked),
        run_test("n_live_count", GROUP, test_n_live_count),
        run_test("extreme_losing_streak_detectable", GROUP, test_extreme_losing_streak_detectable),
    ]
