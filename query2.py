import sqlite3
import json
conn = sqlite3.connect('backend/ironrisk.db')
c = conn.cursor()
c.execute("SELECT metrics_snapshot FROM strategies WHERE name LIKE '%18_usd%' LIMIT 1")
row = c.fetchone()
if row:
    print("Trades", json.dumps(json.loads(row[0])['StagnationTradesMetric'], indent=2))
