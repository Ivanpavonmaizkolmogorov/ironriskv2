import sqlite3
import json

conn = sqlite3.connect('backend/ironrisk.db')
c = conn.cursor()
c.execute("SELECT name, original_equity_curve FROM strategies")
rows = c.fetchall()
for r in rows:
    try:
        curve = json.loads(r[1]) if r[1] else []
        print(f'{r[0]}: original_equity_curve length is {len(curve)}')
    except TypeError:
        print(f'{r[0]}: original_equity_curve is None/Empty')
