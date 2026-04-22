"""Base dataclass for all regression test results."""
from __future__ import annotations
import time
from dataclasses import dataclass, field
from typing import Any


@dataclass
class TestResult:
    name: str
    group: str
    passed: bool
    expected: Any = None
    actual: Any = None
    duration_ms: float = 0.0
    error: str | None = None

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "group": self.group,
            "passed": self.passed,
            "expected": str(self.expected) if self.expected is not None else None,
            "actual": str(self.actual) if self.actual is not None else None,
            "duration_ms": round(self.duration_ms, 1),
            "error": self.error,
        }


def run_test(name: str, group: str, fn) -> TestResult:
    """Run a single test function and return a TestResult."""
    t0 = time.perf_counter()
    try:
        result = fn()
        duration = (time.perf_counter() - t0) * 1000
        if isinstance(result, TestResult):
            result.duration_ms = duration
            return result
        # If fn returns truthy, it passed
        return TestResult(
            name=name, group=group,
            passed=bool(result), duration_ms=duration
        )
    except AssertionError as e:
        duration = (time.perf_counter() - t0) * 1000
        return TestResult(
            name=name, group=group,
            passed=False, error=str(e), duration_ms=duration
        )
    except Exception as e:
        import traceback
        duration = (time.perf_counter() - t0) * 1000
        return TestResult(
            name=name, group=group,
            passed=False, error=f"{type(e).__name__}: {e}\n{traceback.format_exc()[-400:]}",
            duration_ms=duration
        )
