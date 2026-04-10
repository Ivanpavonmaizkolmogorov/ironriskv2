"""One-shot script to delete a user and cascade all related data."""
import sqlite3, os

DB = os.path.join(os.path.dirname(__file__), "ironrisk.db")
TARGET_EMAIL = "zivan_5@hotmail.com"

conn = sqlite3.connect(DB)
c = conn.cursor()

c.execute("SELECT id FROM users WHERE email = ?", (TARGET_EMAIL,))
row = c.fetchone()
if not row:
    print(f"User {TARGET_EMAIL} not found.")
else:
    uid = row[0]
    # Get all trading accounts
    c.execute("SELECT id FROM trading_accounts WHERE user_id = ?", (uid,))
    accs = [r[0] for r in c.fetchall()]
    for aid in accs:
        c.execute("DELETE FROM strategies WHERE account_id = ?", (aid,))
        print(f"  Deleted strategies for account {aid}")
    c.execute("DELETE FROM trading_accounts WHERE user_id = ?", (uid,))
    print(f"  Deleted {len(accs)} trading accounts")
    c.execute("DELETE FROM users WHERE id = ?", (uid,))
    conn.commit()
    print(f"User {TARGET_EMAIL} (id={uid}) fully deleted.")

conn.close()
