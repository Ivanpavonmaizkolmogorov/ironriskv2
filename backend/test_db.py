import sqlite3
import json
conn = sqlite3.connect('ironrisk.db')
conn.row_factory = sqlite3.Row
c = conn.cursor()
configs = [dict(r) for r in c.execute("SELECT id, is_active, target_id, metric_key, operator, threshold_value, cooldown_minutes FROM user_alert_configs").fetchall()]
with open("test_out.json", "w") as f:
    json.dump(configs, f, indent=2)
