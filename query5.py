import sqlite3
import json
conn = sqlite3.connect('backend/ironrisk.db')
c = conn.cursor()
c.execute("SELECT name, metrics_snapshot FROM strategies WHERE name LIKE '%18_usd%' LIMIT 1")
row = c.fetchone()
m = json.loads(row[1])

for root_key in ['StagnationDaysMetric', 'StagnationTradesMetric']:
    metric_params = m.get(root_key, {})
    max_key = next((k for k in metric_params.keys() if k.startswith("max_")), None)
    print(f"{root_key} max_key: {max_key}, value: {metric_params.get(max_key)}")
