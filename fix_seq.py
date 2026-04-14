import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('62.238.19.114', username='root', password='IronRisk_Production_2026!')

importer = """
from sqlalchemy import create_engine, MetaData, text

DB_URL = "postgresql://ironrisk_user:ouu7-iHet06AxyAMZvNw-g@localhost:5432/ironrisk"

engine = create_engine(DB_URL)
order = ['users', 'user_preferences', 'user_themes', 'trading_accounts', 
         'portfolios', 'strategies', 'real_trades', 'strategy_links', 
         'system_settings', 'user_alert_configs', 'user_alert_history', 'waitlist_leads']

with engine.begin() as conn:
    for table_name in order:
        try:
            conn.execute(text(f"SELECT setval('{table_name}_id_seq', COALESCE((SELECT MAX(id)+1 FROM {table_name}), 1), false);"))
        except:
            pass
"""
ssh.exec_command(f"cat << 'EOF' > /var/www/ironrisk/backend/fix_seq.py\n{importer}\nEOF")

cmd = 'cd /var/www/ironrisk/backend && ./venv/bin/python fix_seq.py'
stdin, stdout, stderr = ssh.exec_command(cmd)
print("Finished!")
