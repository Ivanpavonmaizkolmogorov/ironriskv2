"""
pytest-compatible wrapper for the IronRisk regression suite.

Usage:
    cd backend && pytest tests/test_regression.py -v

GitHub Actions will run this to block deploys on failures.
"""
import pytest
import sys
from pathlib import Path

# Ensure backend root is on sys.path regardless of where pytest is invoked from
sys.path.insert(0, str(Path(__file__).parent.parent))


def test_full_regression_suite():
    """
    Single pytest test that runs all regression groups.
    If ANY sub-test fails, this test fails with a human-readable summary.
    """
    from tests.suite.runner import run_all

    result = run_all()

    failed_tests = [
        t
        for group_results in result["groups"].values()
        for t in group_results
        if not t["passed"]
    ]

    if failed_tests:
        summary_lines = [
            f"\n{'='*60}",
            f"❌ {len(failed_tests)} regression test(s) FAILED:",
            f"{'='*60}",
        ]
        for t in failed_tests:
            summary_lines.append(f"\n  [{t['group']}] {t['name']}")
            if t.get("expected"):
                summary_lines.append(f"    expected : {t['expected']}")
            if t.get("actual"):
                summary_lines.append(f"    actual   : {t['actual']}")
            if t.get("error"):
                # Truncate long tracebacks for readability
                err = t["error"][:600] if len(t.get("error", "")) > 600 else t["error"]
                summary_lines.append(f"    error    : {err}")

        summary_lines.append(f"\n{'='*60}")
        summary_lines.append(
            f"Total: {result['passed']}/{result['total']} passed "
            f"in {result['duration_ms']}ms"
        )
        pytest.fail("\n".join(summary_lines))
