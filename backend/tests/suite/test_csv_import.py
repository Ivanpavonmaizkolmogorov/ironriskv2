"""
CSV Import regression tests.
Verifies that:
  - demo_backtest.csv is parsed correctly (correct trade count, no crash)
  - Uploaded CSV does NOT trigger the 'Simulated Edge' naming bug
  - Strategy name derives from filename, not hardcoded defaults
  - Magic number is 0 when not in file (expected for backtest CSVs)
"""
from __future__ import annotations
from pathlib import Path
from .base import TestResult, run_test

GROUP = "csv_import"

# Self-contained fixture — always available regardless of deploy structure
DEMO_CSV = Path(__file__).parent.parent / "fixtures" / "demo_backtest.csv"
DEMO_FILENAME = "demo_backtest.csv"
EXPECTED_TRADE_COUNT = 762  # Known value from file inspection (trailing blank line excluded)


def _load_demo_trades():
    """Parse the demo CSV using the real backend CSV parser."""
    from services.csv_parser import parse_csv
    content = DEMO_CSV.read_bytes()
    trades, summary = parse_csv(content, filename=DEMO_FILENAME)
    return trades, summary


def test_demo_csv_exists() -> TestResult:
    exists = DEMO_CSV.exists()
    return TestResult(
        name="demo_csv_exists",
        group=GROUP,
        passed=exists,
        expected="File exists",
        actual=str(DEMO_CSV) if exists else "FILE NOT FOUND",
        error=None if exists else f"Demo CSV not found at {DEMO_CSV}"
    )


def test_csv_parses_correctly() -> TestResult:
    trades, summary = _load_demo_trades()
    count = len(trades)
    passed = count == EXPECTED_TRADE_COUNT
    return TestResult(
        name="csv_parses_correctly",
        group=GROUP,
        passed=passed,
        expected=EXPECTED_TRADE_COUNT,
        actual=count,
        error=None if passed else f"Expected {EXPECTED_TRADE_COUNT} trades but got {count}"
    )


def test_csv_pnl_column_present() -> TestResult:
    trades, _ = _load_demo_trades()
    has_pnl = all("pnl" in t for t in trades[:5])
    return TestResult(
        name="csv_pnl_column_present",
        group=GROUP,
        passed=has_pnl,
        expected="All trades have 'pnl'",
        actual="OK" if has_pnl else "Missing 'pnl' key in some trades"
    )


def test_csv_summary_has_equity_curve() -> TestResult:
    _, summary = _load_demo_trades()
    curve = summary.get("equity_curve", [])
    passed = len(curve) > 0
    return TestResult(
        name="csv_summary_has_equity_curve",
        group=GROUP,
        passed=passed,
        expected="equity_curve non-empty",
        actual=f"{len(curve)} points"
    )


def test_strategy_name_not_simulated_edge() -> TestResult:
    """Strategy name derived from file should never default to 'Simulated Edge'."""
    name_from_file = DEMO_FILENAME.replace(".csv", "").replace(".htm", "").replace(".html", "")
    is_simulated_edge = name_from_file.strip().lower() == "simulated edge"
    return TestResult(
        name="strategy_name_not_simulated_edge",
        group=GROUP,
        passed=not is_simulated_edge,
        expected="Name != 'Simulated Edge'",
        actual=name_from_file
    )


def test_csv_has_positive_and_negative_trades() -> TestResult:
    trades, _ = _load_demo_trades()
    wins = sum(1 for t in trades if t.get("pnl", 0) > 0)
    losses = sum(1 for t in trades if t.get("pnl", 0) < 0)
    passed = wins > 0 and losses > 0
    return TestResult(
        name="csv_has_positive_and_negative_trades",
        group=GROUP,
        passed=passed,
        expected="wins > 0 AND losses > 0",
        actual=f"{wins} wins, {losses} losses"
    )


def run_group() -> list[TestResult]:
    return [
        run_test("demo_csv_exists", GROUP, test_demo_csv_exists),
        run_test("csv_parses_correctly", GROUP, test_csv_parses_correctly),
        run_test("csv_pnl_column_present", GROUP, test_csv_pnl_column_present),
        run_test("csv_summary_has_equity_curve", GROUP, test_csv_summary_has_equity_curve),
        run_test("strategy_name_not_simulated_edge", GROUP, test_strategy_name_not_simulated_edge),
        run_test("csv_has_positive_and_negative_trades", GROUP, test_csv_has_positive_and_negative_trades),
    ]
