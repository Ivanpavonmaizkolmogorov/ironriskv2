import sqlite3
conn = sqlite3.connect('ironrisk.db')
conn.execute('ALTER TABLE strategies ADD COLUMN distribution_fit TEXT DEFAULT "{}"')
conn.commit()
conn.close()
print('Column distribution_fit added OK')
