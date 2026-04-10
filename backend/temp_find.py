import sqlite3
import pandas as pd
conn = sqlite3.connect('ironrisk.db')
df = pd.read_sql("SELECT name FROM strategies", conn)
for n in df['name']:
    if 'BuyStop' in n or '18' in n:
        print(n)
