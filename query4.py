import sqlite3
import json
conn = sqlite3.connect('backend/ironrisk.db')
c = conn.cursor()
c.execute("SELECT name, metrics_snapshot FROM strategies WHERE name LIKE '%18_usd%'")
for n, m in c.fetchall():
    print(n)
    if m:
        try:
            print(json.loads(m).keys())
        except:
            print("Invalid json")
    else:
        print("No metrics")
