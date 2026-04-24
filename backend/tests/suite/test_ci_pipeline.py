"""Regression tests for CI pipelines and scripts to prevent deployment failures."""
import os
import glob
from .base import TestResult

def test_github_actions_venv_path() -> TestResult:
    """Ensure that the deploy-backend.yml has correct venv paths."""
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    deploy_file = os.path.join(base_dir, ".github", "workflows", "deploy-backend.yml")
    
    if not os.path.exists(deploy_file):
         return TestResult(name="test_github_actions_venv_path", group="ci", passed=False, error="deploy-backend.yml not found in .github folder")
         
    with open(deploy_file, "r", encoding="utf-8") as f:
        content = f.read()
        
    # The common bug was using /var/www/ironrisk/venv instead of /var/www/ironrisk/backend/venv
    if "source /var/www/ironrisk/venv" in content:
        return TestResult(
            name="test_github_actions_venv_path", 
            group="ci", 
            passed=False, 
            error="Found incorrect venv path missing 'backend/' in deploy-backend.yml. Do not use /var/www/ironrisk/venv directly."
        )
        
    return TestResult(name="test_github_actions_venv_path", group="ci", passed=True)


def test_deploy_runs_migrations_before_restart() -> TestResult:
    """Ensure deploy-backend.yml runs 'alembic upgrade head' BEFORE 'systemctl restart'.
    
    This prevents the exact production outage from 2026-04-24 where new model
    columns were referenced by code but didn't exist in the database yet.
    """
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    deploy_file = os.path.join(base_dir, ".github", "workflows", "deploy-backend.yml")
    
    if not os.path.exists(deploy_file):
        return TestResult(name="test_deploy_runs_migrations_before_restart", group="ci", passed=False, error="deploy-backend.yml not found")
    
    with open(deploy_file, "r", encoding="utf-8") as f:
        content = f.read()
    
    if "alembic upgrade head" not in content:
        return TestResult(
            name="test_deploy_runs_migrations_before_restart",
            group="ci",
            passed=False,
            error="deploy-backend.yml is missing 'alembic upgrade head'. DB migrations MUST run before service restart."
        )
    
    # Verify ordering: alembic must appear BEFORE systemctl restart
    alembic_pos = content.index("alembic upgrade head")
    restart_pos = content.index("systemctl restart")
    if alembic_pos > restart_pos:
        return TestResult(
            name="test_deploy_runs_migrations_before_restart",
            group="ci",
            passed=False,
            error="'alembic upgrade head' appears AFTER 'systemctl restart'. Migrations must run first."
        )
    
    return TestResult(name="test_deploy_runs_migrations_before_restart", group="ci", passed=True)


def run_group() -> list[TestResult]:
    from .base import run_test
    return [
        run_test("test_github_actions_venv_path", "ci", test_github_actions_venv_path),
        run_test("test_deploy_runs_migrations_before_restart", "ci", test_deploy_runs_migrations_before_restart),
    ]
