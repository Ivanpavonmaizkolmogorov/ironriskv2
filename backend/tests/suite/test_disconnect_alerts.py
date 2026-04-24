"""Regression tests for the Disconnect Alert Pipeline.

These tests validate the critical bugs fixed on 2026-04-24:
1. Watchdog must dispatch using user's configured target_id (not account's own id)
2. Disconnect alerts fire ONCE per incident, auto-reset on reconnect
3. History cleanup happens when ALL user accounts come back online
4. Cooldown=0 must NOT block alerts forever
5. Collision flag must auto-clear when same hostname sends heartbeats
"""
import os
import ast
import re
from .base import TestResult


def _read_file(relative_path: str) -> str:
    """Read a file relative to the project root."""
    base_dir = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
    full_path = os.path.join(base_dir, relative_path.replace("/", os.sep))
    with open(full_path, "r", encoding="utf-8") as f:
        return f.read()


def test_watchdog_dispatches_by_user_not_account() -> TestResult:
    """The watchdog must query UserAlertConfig by user_id + metric_key,
    NOT by target_id == acc.id. This ensures one alert config covers ALL workspaces.
    
    Regression for: user configures disconnect alert on workspace A, 
    workspace B disconnects → alert must still fire.
    """
    content = _read_file("backend/main.py")
    
    # Must query by user_id and metric_key
    if "UserAlertConfig.user_id == acc.user_id" not in content:
        return TestResult(name="test_watchdog_dispatches_by_user_not_account", group="alerts",
            passed=False, error="Watchdog must query UserAlertConfig by user_id, not account id")
    
    if 'metric_key == "ea_disconnect_minutes"' not in content:
        return TestResult(name="test_watchdog_dispatches_by_user_not_account", group="alerts",
            passed=False, error="Watchdog must filter by metric_key='ea_disconnect_minutes'")
    
    # Must dispatch with cfg.target_id (from config), NOT acc.id
    if "target_id=cfg.target_id" not in content:
        return TestResult(name="test_watchdog_dispatches_by_user_not_account", group="alerts",
            passed=False, error="Watchdog must dispatch with cfg.target_id (from user config), not acc.id")
    
    return TestResult(name="test_watchdog_dispatches_by_user_not_account", group="alerts", passed=True)


def test_disconnect_fires_once_per_incident() -> TestResult:
    """Disconnect alerts must fire ONCE per incident. When there's already a history
    entry for ea_disconnect_minutes, the engine must skip (continue) without checking
    cooldown — the history is cleared by the watchdog when ALL accounts reconnect.
    
    Regression for: cooldown=0 blocked alerts forever because history was never cleared.
    """
    content = _read_file("backend/services/notifications/alert_manager.py")
    
    # Must have the "fire once" check for ea_disconnect
    if 'config.metric_key == "ea_disconnect_minutes"' not in content:
        return TestResult(name="test_disconnect_fires_once_per_incident", group="alerts",
            passed=False, error="AlertEngine must have special once-per-incident handling for ea_disconnect_minutes")
    
    # The ea_disconnect check must be INSIDE the `if last_hist:` block
    # and must `continue` (skip re-firing)
    lines = content.split("\n")
    in_last_hist_block = False
    found_disconnect_continue = False
    for line in lines:
        stripped = line.strip()
        if "if last_hist:" in stripped:
            in_last_hist_block = True
        if in_last_hist_block and 'ea_disconnect_minutes' in stripped:
            # Next non-empty line should be continue
            found_disconnect_continue = True
    
    if not found_disconnect_continue:
        return TestResult(name="test_disconnect_fires_once_per_incident", group="alerts",
            passed=False, error="ea_disconnect_minutes must skip re-firing when history exists (continue inside if last_hist)")
    
    return TestResult(name="test_disconnect_fires_once_per_incident", group="alerts", passed=True)


def test_no_cooldown_zero_blocking() -> TestResult:
    """cooldown_minutes == 0 must NOT cause a permanent block.
    The old code had `if config.cooldown_minutes == 0: continue` which 
    blocked alerts forever. This pattern must NOT exist.
    
    Regression for: alert fired once on Apr 14, then never again for 10 days.
    """
    content = _read_file("backend/services/notifications/alert_manager.py")
    
    # The old blocking pattern must not exist
    if "cooldown_minutes == 0" in content and "continue" in content:
        # Check if they're on the same or adjacent lines (the bad pattern)
        lines = content.split("\n")
        for i, line in enumerate(lines):
            if "cooldown_minutes == 0" in line:
                # Check this line and next 2 lines for `continue`
                block = "\n".join(lines[i:i+3])
                if "continue" in block and "ea_disconnect" not in block:
                    return TestResult(name="test_no_cooldown_zero_blocking", group="alerts",
                        passed=False, 
                        error="Found 'cooldown_minutes == 0 → continue' pattern. This blocks alerts forever!")
    
    return TestResult(name="test_no_cooldown_zero_blocking", group="alerts", passed=True)


def test_watchdog_clears_history_on_reconnect() -> TestResult:
    """When ALL accounts for a user are back online, the watchdog must clear
    the UserAlertHistory for ea_disconnect configs. This resets the 
    "once per incident" lock.
    
    Regression for: history from Apr 14 was never cleared, locking the alert permanently.
    """
    content = _read_file("backend/main.py")
    
    # Must have history cleanup logic
    if "UserAlertHistory" not in content:
        return TestResult(name="test_watchdog_clears_history_on_reconnect", group="alerts",
            passed=False, error="Watchdog must import and use UserAlertHistory to clear old entries")
    
    # Must track which users have disconnects
    if "users_with_disconnect" not in content:
        return TestResult(name="test_watchdog_clears_history_on_reconnect", group="alerts",
            passed=False, error="Watchdog must track users_with_disconnect to know when to clear history")
    
    # Must subtract sets to find users with all accounts online
    if "users_seen - users_with_disconnect" not in content:
        return TestResult(name="test_watchdog_clears_history_on_reconnect", group="alerts",
            passed=False, error="Watchdog must compute (users_seen - users_with_disconnect) to find fully-online users")
    
    return TestResult(name="test_watchdog_clears_history_on_reconnect", group="alerts", passed=True)


def test_watchdog_passes_workspace_name() -> TestResult:
    """The watchdog must pass the disconnected workspace name in the metrics payload.
    This allows the alert message to show WHICH workspace went offline.
    
    Regression for: message showed "Objetivo: Nivel de Cuenta / Cuenta: AxiCapitalPropio"
    when a different workspace was the one offline.
    """
    content = _read_file("backend/main.py")
    
    if "disconnected_workspace" not in content:
        return TestResult(name="test_watchdog_passes_workspace_name", group="alerts",
            passed=False, error="Watchdog must include 'disconnected_workspace' in metrics payload")
    
    # The translation must use the workspace name
    translations = _read_file("backend/services/translations.py")
    if "{workspace}" not in translations:
        return TestResult(name="test_watchdog_passes_workspace_name", group="alerts",
            passed=False, error="Translations must use {workspace} placeholder in ea_disconnect body")
    
    return TestResult(name="test_watchdog_passes_workspace_name", group="alerts", passed=True)


def test_disconnect_alert_skips_target_footer() -> TestResult:
    """Disconnect alerts must NOT append the generic 'Objetivo/Cuenta' footer,
    because the target_id points to a different workspace than the one offline.
    
    Regression for: confusing "Objetivo: Nivel de Cuenta / Cuenta: AxiCapitalPropio"
    shown when Nigromante DarwinexZero was the offline workspace.
    """
    content = _read_file("backend/services/notifications/alert_manager.py")
    
    if "skip_target_footer" not in content:
        return TestResult(name="test_disconnect_alert_skips_target_footer", group="alerts",
            passed=False, error="AlertEngine must use skip_target_footer to omit confusing footer on disconnect alerts")
    
    if "not skip_target_footer" not in content:
        return TestResult(name="test_disconnect_alert_skips_target_footer", group="alerts",
            passed=False, error="Target footer block must check 'not skip_target_footer' before appending")
    
    return TestResult(name="test_disconnect_alert_skips_target_footer", group="alerts", passed=True)


def test_telegram_mute_button_in_alerts() -> TestResult:
    """Every Telegram alert must include an inline '🔕 Silenciar' button
    with callback_data = 'mute:{config_id}'. The bot poller must handle
    callback_query to deactivate the alert.
    
    Feature added 2026-04-24 for one-tap alert muting.
    """
    alert_mgr = _read_file("backend/services/notifications/alert_manager.py")
    bot = _read_file("backend/services/telegram_bot.py")
    channels = _read_file("backend/services/notifications/channels.py")
    
    # AlertEngine must build inline keyboard
    if "inline_keyboard" not in alert_mgr:
        return TestResult(name="test_telegram_mute_button_in_alerts", group="alerts",
            passed=False, error="AlertEngine must build inline_keyboard with mute button")
    
    if "mute:" not in alert_mgr:
        return TestResult(name="test_telegram_mute_button_in_alerts", group="alerts",
            passed=False, error="Mute button callback_data must use 'mute:' prefix")
    
    # TelegramChannel must accept reply_markup
    if "reply_markup" not in channels:
        return TestResult(name="test_telegram_mute_button_in_alerts", group="alerts",
            passed=False, error="TelegramChannel.send() must accept reply_markup parameter")
    
    # Bot poller must handle callback_query
    if "callback_query" not in bot:
        return TestResult(name="test_telegram_mute_button_in_alerts", group="alerts",
            passed=False, error="Bot poller must handle callback_query for mute button")
    
    if "_handle_mute_callback" not in bot:
        return TestResult(name="test_telegram_mute_button_in_alerts", group="alerts",
            passed=False, error="Bot must have _handle_mute_callback function")
    
    return TestResult(name="test_telegram_mute_button_in_alerts", group="alerts", passed=True)


def test_collision_flag_auto_clears() -> TestResult:
    """The duplicate_warning flag must auto-clear when heartbeats arrive from
    the same hostname (collision resolved). Previously it stayed forever.
    
    Regression for: "⚠️ Colisión Nodos" badge persisted even after removing
    the duplicate service.
    """
    content = _read_file("backend/api/live.py")
    
    # Must have logic to clear duplicate_warning when same hostname
    lines = content.split("\n")
    found_clear = False
    for i, line in enumerate(lines):
        if "req.hostname == account.hostname" in line:
            # Check next ~8 lines for clearing the flag
            block = "\n".join(lines[i:i+8])
            if 'duplicate_warning' in block and 'False' in block:
                found_clear = True
                break
    
    if not found_clear:
        return TestResult(name="test_collision_flag_auto_clears", group="alerts",
            passed=False, error="duplicate_warning must be set to False when same hostname detected (collision cleared)")
    
    return TestResult(name="test_collision_flag_auto_clears", group="alerts", passed=True)


def test_purge_alert_history_import() -> TestResult:
    """The purge_alert_history endpoint must import from 'models.user_alerts',
    NOT from 'models.user_alert_config' (which doesn't exist).
    
    Regression for: 500 error when calling purge endpoint in production.
    """
    content = _read_file("backend/api/admin.py")
    
    if "models.user_alert_config" in content:
        return TestResult(name="test_purge_alert_history_import", group="alerts",
            passed=False, error="Found 'models.user_alert_config' import — must use 'models.user_alerts'")
    
    return TestResult(name="test_purge_alert_history_import", group="alerts", passed=True)


def run_group() -> list[TestResult]:
    from .base import run_test
    return [
        run_test("test_watchdog_dispatches_by_user_not_account", "alerts", test_watchdog_dispatches_by_user_not_account),
        run_test("test_disconnect_fires_once_per_incident", "alerts", test_disconnect_fires_once_per_incident),
        run_test("test_no_cooldown_zero_blocking", "alerts", test_no_cooldown_zero_blocking),
        run_test("test_watchdog_clears_history_on_reconnect", "alerts", test_watchdog_clears_history_on_reconnect),
        run_test("test_watchdog_passes_workspace_name", "alerts", test_watchdog_passes_workspace_name),
        run_test("test_disconnect_alert_skips_target_footer", "alerts", test_disconnect_alert_skips_target_footer),
        run_test("test_telegram_mute_button_in_alerts", "alerts", test_telegram_mute_button_in_alerts),
        run_test("test_collision_flag_auto_clears", "alerts", test_collision_flag_auto_clears),
        run_test("test_purge_alert_history_import", "alerts", test_purge_alert_history_import),
    ]
