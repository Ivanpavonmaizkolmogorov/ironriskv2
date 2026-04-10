import sqlite3
conn = sqlite3.connect('backend/ironrisk.db')
c = conn.cursor()
c.execute("SELECT id, name, json_extract(metrics_snapshot, '$.StagnationDaysMetric.max_stagnation_days') FROM strategies WHERE name LIKE '%19_Xaus%'")
print(c.fetchall())
