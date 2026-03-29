import sqlite3
import json

conn = sqlite3.connect('C:/Users/ivanp/Desktop/Symbols/Porfolios/ironriskv2/backend/ironrisk.db')
cur = conn.cursor()
cur.execute('SELECT magic_number, distribution_fit FROM strategies')
rows = cur.fetchall()

result = {}
for r in rows:
    magic, dist = r
    try:
        data = json.loads(dist) if dist else {}
        result[magic] = data
    except Exception as e:
        result[magic] = str(e)

with open('C:/Users/ivanp/Desktop/Symbols/Porfolios/ironriskv2/backend/dump_db_fit.json', 'w') as f:
    json.dump(result, f, indent=2)
