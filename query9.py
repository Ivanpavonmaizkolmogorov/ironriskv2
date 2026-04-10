import sqlite3
import json
conn = sqlite3.connect('backend/ironrisk.db')
c = conn.cursor()
c.execute("SELECT name, backtest_trades FROM strategies WHERE name LIKE '%19_Xaus%' LIMIT 1")
row = c.fetchone()
if row and row[1]:
    trades = json.loads(row[1])
    if len(trades) > 0:
        print(trades[0])
