import sqlite3
import json
conn = sqlite3.connect('backend/ironrisk.db')
c = conn.cursor()
c.execute("SELECT id, name, risk_multiplier, metrics_snapshot FROM strategies WHERE name LIKE '%18_usdjpyBuyStop%'")
rows = c.fetchall()
for row in rows:
    print('ID:', row[0], 'RM:', row[2])
    snap = json.loads(row[3])
    print('DD:', snap.get('DrawdownMetric', {}))
