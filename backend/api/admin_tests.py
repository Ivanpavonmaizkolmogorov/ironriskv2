"""Admin: Regression Test Suite API endpoints.

POST /api/admin/tests/run     → Run all tests, return + cache results (admin only)
GET  /api/admin/tests/results → Return last cached results without re-running
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from models.database import get_db
from api.auth import get_current_user
from models.user import User

router = APIRouter(prefix="/api/admin/tests", tags=["Admin Tests"])


def _require_admin(current_user: User = Depends(get_current_user)) -> User:
    if not current_user.is_admin:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user


@router.post("/run")
def run_tests(_: User = Depends(_require_admin)):
    """Execute the full regression suite and return the structured result."""
    try:
        from tests.suite.runner import run_all
        result = run_all()
        return result
    except Exception as e:
        import traceback
        raise HTTPException(
            status_code=500,
            detail=f"Test runner crashed: {e}\n{traceback.format_exc()[-800:]}"
        )


@router.get("/results")
def get_last_results(_: User = Depends(_require_admin)):
    """Return the last persisted test results without re-running."""
    from tests.suite.runner import load_cached
    cached = load_cached()
    if cached is None:
        return {
            "run_at": None,
            "total": 0,
            "passed": 0,
            "failed": 0,
            "success_rate": 0.0,
            "duration_ms": 0.0,
            "groups": {},
            "message": "No test results yet. Click 'Run Tests' to execute."
        }
    return cached
