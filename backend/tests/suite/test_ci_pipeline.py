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

def run_group() -> list[TestResult]:
    from .base import run_test
    return [
        run_test("test_github_actions_venv_path", "ci", test_github_actions_venv_path),
    ]

