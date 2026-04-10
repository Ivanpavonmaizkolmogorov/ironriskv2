import sqlite3
import re
conn = sqlite3.connect('backend/ironrisk.db')
c = conn.cursor()
c.execute("SELECT name, json_extract(metrics_snapshot, '$.StagnationDaysMetric.max_stagnation_days') FROM strategies")
rows = c.fetchall()
for r in rows:
    if r[1] is None or r[1] == 0:
        print(f"ZERO or NULL: {r[0][:20]}")
    else:
        print(f"OK: {r[0][:20]} => {r[1]}")
