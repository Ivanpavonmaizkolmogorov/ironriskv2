import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('62.238.19.114', username='root', password='IronRisk_Production_2026!')

# We rewrite restore.py manually
importer = """import json, os
from sqlalchemy import create_engine, MetaData, insert, text

DB_URL = "postgresql://ironrisk_user:ouu7-iHet06AxyAMZvNw-g@localhost:5432/ironrisk"
BACKUP_DIR = "/var/www/ironrisk/db_restore"

engine = create_engine(DB_URL)
meta = MetaData()
meta.reflect(bind=engine)

order = ['users', 'user_preferences', 'user_themes', 'trading_accounts', 
         'portfolios', 'strategies', 'real_trades', 'strategy_links', 
         'system_settings', 'user_alert_configs', 'user_alert_history', 'waitlist_leads']

with engine.connect() as conn:
    for table_name in reversed(order):
        table = meta.tables.get(table_name)
        if table is not None:
            conn.execute(table.delete())
    conn.commit()
    print("Deleted all old rows")
    
    for table_name in order:
        json_file = os.path.join(BACKUP_DIR, f"{table_name}.json")
        if not os.path.exists(json_file): continue
        with open(json_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
            
        if not data: continue
        table = meta.tables[table_name]
        
        print(f"Restoring {table_name} ({len(data)} rows)...")
        # Try raw insert values
        for row in data:
            try:
                conn.execute(insert(table).values(**row))
            except Exception as e:
                print(f"Err row in {table_name}: {e}")
                
        # Commit per table
        conn.commit()

    conn.commit()

print("Verifying users...")
with engine.connect() as conn:
    res = conn.execute(text("SELECT email FROM users;")).mappings().all()
    print("Users found:", res)
"""
ssh.exec_command(f"cat << 'EOF' > /var/www/ironrisk/backend/test_restore.py\n{importer}\nEOF")

cmd = 'cd /var/www/ironrisk/backend && ./venv/bin/python test_restore.py'
stdin, stdout, stderr = ssh.exec_command(cmd)

print("OUT:", stdout.read().decode())
print("ERR:", stderr.read().decode())
