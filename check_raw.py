import sqlite3
import json

conn = sqlite3.connect('backend/ironrisk.db')
c = conn.cursor()
c.execute("SELECT name, risk_multiplier, distribution_fit FROM strategies WHERE name LIKE '21_gbpjpy%'")
row = c.fetchone()
if row:
    print(f'RM: {row[1]}')
    dist_fit = json.loads(row[2])
    print(dist_fit.keys())
    if 'max_drawdown' in dist_fit:
        print('Max value in raw_data:', max(dist_fit['max_drawdown']['raw_data']))
