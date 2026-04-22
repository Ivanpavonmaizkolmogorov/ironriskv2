"""
Strategy Selection Consistency tests.

Bug reported by user: the Bayes panel header shows "20_usdjpyBuyStopV3"
but the table highlights "58_usdjpyBuyStopP..." in green.

Root cause: The store auto-selects strategies[0] by backend-order, but the
frontend table re-sorts that list by a defaultSortKey (e.g. 'expectativa').
The highlighted row in the sorted view is position-0 in the sorted list, but
the actual selected strategy in state is position-0 from the unsorted backend
list — these two can be completely different strategies.

These tests validate:
  1. selectStrategy() sets the strategy whose ID matches exactly — not by index.
  2. After a re-sort (name vs metric change), selectedId still matches the
     correct strategy object.
  3. Auto-selection on load picks strategies[0] by backend order (no sort).
  4. When selectedId is not present in the list, selectedStrategy becomes None.
  5. fetchStrategies() refresh preserves the currently selected strategy by ID,
     not by position (so a new strategy appearing before it doesn't hijack selection).
"""
from __future__ import annotations

from .base import TestResult, run_test

GROUP = "selection_consistency"


# ── Simulate the pure store logic in Python (no DB needed) ──

def _make_strategy(id: str, name: str, magic_number: int, expectativa: float) -> dict:
    """Minimal strategy dict matching the shape the store works with."""
    return {
        "id": id,
        "name": name,
        "magic_number": magic_number,
        "total_trades": 100,
        "metrics_snapshot": {"avg_profit": expectativa},
        "equity_curve": [],
        "risk_config": {},
    }


def _select_by_id(strategies: list[dict], target_id: str) -> dict | None:
    """Mirror of useStrategyStore.selectStrategy: find by id, not by index."""
    return next((s for s in strategies if s["id"] == target_id), None)


def _auto_select_first(strategies: list[dict], current_selected: dict | None) -> dict | None:
    """Mirror of useStrategyStore.fetchStrategies auto-select logic."""
    if not current_selected and strategies:
        return strategies[0]  # picks backend-order first, NOT sorted-order first
    if current_selected:
        updated = next((s for s in strategies if s["id"] == current_selected["id"]), None)
        if updated:
            return updated
        return strategies[0] if strategies else None
    return None


def _sort_by_expectativa_desc(strategies: list[dict]) -> list[dict]:
    """Simulate table front-end sort by expectativa descending (typical defaultSortKey)."""
    return sorted(strategies, key=lambda s: s["metrics_snapshot"]["avg_profit"], reverse=True)


# ── Test cases ──

def test_select_by_id_not_by_position() -> TestResult:
    """
    selectStrategy(id) must return the strategy with that exact ID,
    regardless of where it appears in the list.
    The bug was that the frontend table's position-0 (after sort) was always
    highlighted, which may differ from selectedStrategy (backend position-0).
    """
    strategies = [
        _make_strategy("id-20", "20_usdjpyBuyStopV3", 11112, 20.8),
        _make_strategy("id-58", "58_usdjpyBuyStopP", 11111, 24.3),
        _make_strategy("id-6",  "6_WS30V1",          11113, 13.4),
    ]

    # Backend auto-selects strategies[0] = "20_usdjpy" (id-20)
    selected = _auto_select_first(strategies, None)
    assert selected is not None and selected["id"] == "id-20", \
        f"Auto-select should pick backend[0]='id-20', got {selected}"

    # Frontend table sorts by expectativa desc → order becomes: 58, 20, 6
    sorted_list = _sort_by_expectativa_desc(strategies)
    assert sorted_list[0]["id"] == "id-58", \
        f"Sorted[0] should be 'id-58', got {sorted_list[0]['id']}"

    # The highlighted row in the table (position-0 of sorted list) is id-58
    table_highlighted_id = sorted_list[0]["id"]

    # The panel shows selectedStrategy.id = id-20
    panel_strategy_id = selected["id"]

    # THIS IS THE BUG: they don't match when sort changes table order
    mismatch_detected = table_highlighted_id != panel_strategy_id

    return TestResult(
        name="select_by_id_not_by_position",
        group=GROUP,
        passed=mismatch_detected,  # We WANT this to be detected (the bug exists!)
        expected="mismatch detected (table[0]='id-58' != selected='id-20')",
        actual=f"table[0]={table_highlighted_id}, selected={panel_strategy_id}",
        error=None if mismatch_detected else "Bug not detectable — store may have been fixed already"
    )


def test_selectStrategy_returns_correct_object() -> TestResult:
    """After calling selectStrategy('id-20'), the result must be the 20 strategy, not 58."""
    strategies = [
        _make_strategy("id-20", "20_usdjpyBuyStopV3", 11112, 20.8),
        _make_strategy("id-58", "58_usdjpyBuyStopP", 11111, 24.3),
    ]
    result = _select_by_id(strategies, "id-20")
    passed = result is not None and result["id"] == "id-20" and result["name"] == "20_usdjpyBuyStopV3"
    return TestResult(
        name="selectStrategy_returns_correct_object",
        group=GROUP,
        passed=passed,
        expected="id='id-20', name='20_usdjpyBuyStopV3'",
        actual=f"id={result['id']}, name={result['name']}" if result else "None"
    )


def test_auto_select_preserves_id_after_refresh() -> TestResult:
    """
    When fetchStrategies refreshes and a new strategy appears before the
    currently selected one, the selection must NOT change to the newcomer.
    """
    # Initial load: two strategies, id-20 is selected
    initial = [
        _make_strategy("id-20", "20_usdjpy", 11112, 20.8),
        _make_strategy("id-58", "58_usdjpy", 11111, 24.3),
    ]
    selected = _auto_select_first(initial, None)  # picks id-20

    # After refresh: a new strategy with higher ID appears at the start
    refreshed = [
        _make_strategy("id-99", "99_newbot", 11114, 99.0),  # new one, first in backend list
        _make_strategy("id-20", "20_usdjpy", 11112, 20.8),
        _make_strategy("id-58", "58_usdjpy", 11111, 24.3),
    ]
    new_selected = _auto_select_first(refreshed, selected)

    # Must still be id-20, NOT id-99
    passed = new_selected is not None and new_selected["id"] == "id-20"
    return TestResult(
        name="auto_select_preserves_id_after_refresh",
        group=GROUP,
        passed=passed,
        expected="selected='id-20' preserved after refresh",
        actual=f"selected='{new_selected['id'] if new_selected else None}'"
    )


def test_selected_id_missing_from_list_falls_back() -> TestResult:
    """
    If the selected strategy ID disappears from the list (e.g. deleted remotely),
    the store falls back to strategies[0] rather than keeping a stale reference.
    """
    strategies = [
        _make_strategy("id-58", "58_usdjpy", 11111, 24.3),
        _make_strategy("id-6",  "6_ws30",    11113, 13.4),
    ]
    ghost_selected = _make_strategy("id-20", "20_usdjpy_deleted", 11112, 20.8)

    new_selected = _auto_select_first(strategies, ghost_selected)

    # Ghost ID not in list → fall back to strategies[0] = id-58
    passed = new_selected is not None and new_selected["id"] == "id-58"
    return TestResult(
        name="selected_id_missing_from_list_falls_back",
        group=GROUP,
        passed=passed,
        expected="fallback to 'id-58' (first in list)",
        actual=f"selected='{new_selected['id'] if new_selected else None}'"
    )


def test_sort_does_not_change_selected_object() -> TestResult:
    """
    Sorting the table must not change which strategy is 'selected' in the store.
    The store holds selectedStrategy by ID — the table just renders in a different order.
    """
    strategies = [
        _make_strategy("id-20", "20_usdjpy", 11112, 20.8),
        _make_strategy("id-58", "58_usdjpy", 11111, 24.3),
        _make_strategy("id-6",  "6_ws30",    11113, 13.4),
    ]

    # Store selects by explicit click on id-20
    selected_id = "id-20"
    selected_obj = _select_by_id(strategies, selected_id)

    # Simulate table sort — sorted list has different order
    sorted_list = _sort_by_expectativa_desc(strategies)  # 58, 20, 6
    highlighted_in_table = next((s for s in sorted_list if s["id"] == selected_id), None)

    # The selected object in the store and the highlighted table row must refer to same ID
    passed = (
        selected_obj is not None
        and highlighted_in_table is not None
        and selected_obj["id"] == highlighted_in_table["id"]
        and sorted_list[0]["id"] != selected_id  # Confirm order DID change (58 is now first)
    )
    return TestResult(
        name="sort_does_not_change_selected_object",
        group=GROUP,
        passed=passed,
        expected=f"selected='id-20' is in sorted list at non-0 position; sorted[0]='id-58'",
        actual=(
            f"selected='{selected_obj['id'] if selected_obj else None}', "
            f"sorted[0]='{sorted_list[0]['id']}', "
            f"highlighted='{highlighted_in_table['id'] if highlighted_in_table else None}'"
        )
    )


def run_group() -> list[TestResult]:
    return [
        run_test("select_by_id_not_by_position", GROUP, test_select_by_id_not_by_position),
        run_test("selectStrategy_returns_correct_object", GROUP, test_selectStrategy_returns_correct_object),
        run_test("auto_select_preserves_id_after_refresh", GROUP, test_auto_select_preserves_id_after_refresh),
        run_test("selected_id_missing_from_list_falls_back", GROUP, test_selected_id_missing_from_list_falls_back),
        run_test("sort_does_not_change_selected_object", GROUP, test_sort_does_not_change_selected_object),
    ]
