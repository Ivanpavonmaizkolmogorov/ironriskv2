"""
IronRisk Regression Test Runner.

Orchestrates all test groups, measures timing, serializes results to JSON.
Callable:
  - From the FastAPI admin endpoint (in-process)
  - From pytest via tests/test_regression.py
  - From the CLI: python -m tests.suite.runner
"""
from __future__ import annotations
import json
import time
import logging
from datetime import datetime, timezone
from pathlib import Path

from .base import TestResult

logger = logging.getLogger("ironrisk.test_runner")

# Persist results here so the admin panel can read without re-running
RESULTS_CACHE = Path(__file__).parent.parent.parent / "test_results_cache.json"


def run_all() -> dict:
    """Run every registered test group and return a structured result dict."""
    from . import test_csv_import, test_bayes, test_bayes_live, test_selection_consistency, test_risk_gauges

    groups_map = {
        "csv_import": test_csv_import.run_group,
        "bayes": test_bayes.run_group,
        "bayes_live": test_bayes_live.run_group,
        "selection_consistency": test_selection_consistency.run_group,
        "risk_gauges": test_risk_gauges.run_group,
    }

    t_start = time.perf_counter()
    groups: dict[str, list[dict]] = {}
    total = 0
    passed_count = 0

    for group_name, run_fn in groups_map.items():
        try:
            results: list[TestResult] = run_fn()
        except Exception as e:
            import traceback
            logger.error(f"[TestRunner] Group '{group_name}' crashed: {e}\n{traceback.format_exc()}")
            results = [TestResult(
                name=f"{group_name}_runner_crash",
                group=group_name,
                passed=False,
                error=f"Group runner crashed: {e}"
            )]

        serialized = [r.to_dict() for r in results]
        groups[group_name] = serialized
        total += len(serialized)
        passed_count += sum(1 for r in serialized if r["passed"])

    duration_ms = round((time.perf_counter() - t_start) * 1000, 1)
    failed = total - passed_count

    result = {
        "run_at": datetime.now(timezone.utc).isoformat(),
        "total": total,
        "passed": passed_count,
        "failed": failed,
        "success_rate": round(passed_count / total * 100, 1) if total else 0.0,
        "duration_ms": duration_ms,
        "groups": groups,
    }

    # Persist to disk for the admin panel GET endpoint
    try:
        RESULTS_CACHE.write_text(json.dumps(result, indent=2), encoding="utf-8")
    except Exception as e:
        logger.warning(f"[TestRunner] Could not persist cache: {e}")

    logger.info(
        f"[TestRunner] Done — {passed_count}/{total} passed "
        f"({'✅' if failed == 0 else '❌'}) in {duration_ms}ms"
    )
    return result


def load_cached() -> dict | None:
    """Load the last persisted test results without re-running."""
    if RESULTS_CACHE.exists():
        try:
            return json.loads(RESULTS_CACHE.read_text("utf-8"))
        except Exception:
            return None
    return None


if __name__ == "__main__":
    import sys
    sys.path.insert(0, str(Path(__file__).parent.parent.parent))
    result = run_all()
    print(json.dumps(result, indent=2))
    sys.exit(0 if result["failed"] == 0 else 1)
