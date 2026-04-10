import sqlite3
import json
conn = sqlite3.connect('backend/ironrisk.db')
c = conn.cursor()
c.execute("SELECT metrics_snapshot FROM strategies WHERE name LIKE '%19_Xaus%' LIMIT 1")
row = c.fetchone()
if row:
    print("19_Xaus", json.dumps(json.loads(row[0])['StagnationDaysMetric'], indent=2))
