import sqlite3
import json

OLD_DB = "ironrisk.db.bak"
NEW_DB = "ironrisk.db"
TARGET_EMAIL = "ivanpavonmaiz@gmail.com"

old_conn = sqlite3.connect(OLD_DB)
old_conn.row_factory = sqlite3.Row
new_conn = sqlite3.connect(NEW_DB)
new_conn.row_factory = sqlite3.Row

# Get Target User ID
target_user = new_conn.execute("SELECT id FROM users WHERE email=?", (TARGET_EMAIL,)).fetchone()
if not target_user:
    target_user = new_conn.execute("SELECT id FROM users LIMIT 1").fetchone()

if not target_user:
    print("NO USERS IN NEW DB!")
    exit(1)

user_id = target_user['id']
print(f"Target user ID: {user_id}")

# 1. Get Trading Account 'Nigromante' from OLD
old_acct = old_conn.execute("SELECT * FROM trading_accounts WHERE name LIKE '%Nigromante%' LIMIT 1").fetchone()
if not old_acct:
    print("Nigromante account not found in OLD DB.")
    exit(1)

acct_id = old_acct['id']
print(f"Found Nigromante Account: {acct_id}")

# Get new columns for trading_accounts
new_ta_cols = [x[1] for x in new_conn.execute("PRAGMA table_info(trading_accounts)").fetchall()]

# Filter old acct keys
acct_data = dict(old_acct)
acct_data['user_id'] = user_id # Re-assign to target
filtered_acct = {k: v for k, v in acct_data.items() if k in new_ta_cols}

# Delete existing to prevent dups (optional)
new_conn.execute("DELETE FROM trading_accounts WHERE id=?", (acct_id,))

# Insert Trading Account
cols = ", ".join(filtered_acct.keys())
placeholders = ", ".join(["?"] * len(filtered_acct))
new_conn.execute(f"INSERT INTO trading_accounts ({cols}) VALUES ({placeholders})", tuple(filtered_acct.values()))
print(f"Inserted Trading Account successfully.")

# 2. Strategies
old_strategies = old_conn.execute("SELECT * FROM strategies WHERE trading_account_id=?", (acct_id,)).fetchall()
new_strat_cols = [x[1] for x in new_conn.execute("PRAGMA table_info(strategies)").fetchall()]

new_conn.execute("DELETE FROM strategies WHERE trading_account_id=?", (acct_id,))

for st in old_strategies:
    s_data = dict(st)
    f_st = {k: v for k, v in s_data.items() if k in new_strat_cols}
    s_cols = ", ".join(f_st.keys())
    s_ph = ", ".join(["?"] * len(f_st))
    new_conn.execute(f"INSERT INTO strategies ({s_cols}) VALUES ({s_ph})", tuple(f_st.values()))
    
print(f"Copied {len(old_strategies)} strategies.")

# 3. Portfolios
old_portfolios = old_conn.execute("SELECT * FROM portfolios WHERE trading_account_id=?", (acct_id,)).fetchall()
new_port_cols = [x[1] for x in new_conn.execute("PRAGMA table_info(portfolios)").fetchall()]

new_conn.execute("DELETE FROM portfolios WHERE trading_account_id=?", (acct_id,))

for pt in old_portfolios:
    p_data = dict(pt)
    f_pt = {k: v for k, v in p_data.items() if k in new_port_cols}
    p_cols = ", ".join(f_pt.keys())
    p_ph = ", ".join(["?"] * len(f_pt))
    new_conn.execute(f"INSERT INTO portfolios ({p_cols}) VALUES ({p_ph})", tuple(f_pt.values()))

print(f"Copied {len(old_portfolios)} portfolios.")

new_conn.commit()
print("Commit successful. Nigromante has been rescued.")
