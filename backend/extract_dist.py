import sqlite3, json, pandas as pd
conn = sqlite3.connect('ironrisk.db')
df = pd.read_sql("SELECT name, distribution_fit FROM strategies WHERE name LIKE '%18%BuyStop%' LIMIT 1", conn)
d = json.loads(df.iloc[0]['distribution_fit'])
with open('temp_dist.json', 'w') as f:
    json.dump(d.get('stagnation_days', {}), f, indent=2)
print("Saved to temp_dist.json")
