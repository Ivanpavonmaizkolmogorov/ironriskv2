"""Mark a user as admin."""
import sqlite3, os

DB = os.path.join(os.path.dirname(__file__), "ironrisk.db")
conn = sqlite3.connect(DB)
c = conn.cursor()
c.execute("UPDATE users SET is_admin = 1 WHERE email = ?", ("ivanpavonmaiz@gmail.com",))
print(f"Rows updated: {c.rowcount}")
conn.commit()
conn.close()
