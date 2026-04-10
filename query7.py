import sqlite3
conn = sqlite3.connect('backend/ironrisk.db')
c = conn.cursor()
c.execute("SELECT name, json_extract(metrics_snapshot, '$.StagnationDaysMetric.max_stagnation_days') FROM strategies")
for row in c.fetchall():
    print(row)
