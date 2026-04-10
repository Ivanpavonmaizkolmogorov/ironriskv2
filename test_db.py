import sqlite3
conn = sqlite3.connect('backend/ironrisk.db')
c = conn.cursor()
print("--- ACTIVE CONFIGS ---")
c.execute("SELECT id, metric_key, operator, threshold_value, cooldown_minutes, is_active FROM user_alert_configs WHERE target_id='ab1d21b8-e083-4671-91ef-9f6414d5e8b8'")
for row in c.fetchall():
    print(row)
print("--- ALL CONFIGS ---")
c.execute("SELECT id, target_id, metric_key, operator, threshold_value, cooldown_minutes, is_active FROM user_alert_configs")
for row in c.fetchall():
    print(row)
