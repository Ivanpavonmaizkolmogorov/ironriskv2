import paramiko

HOST = '62.238.19.114'
USER = 'root'
PASSWORD = 'IronRisk_Production_2026!'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASSWORD)

# Get the full traceback of the 500 error
print("1. Full traceback of the /uninstall 500 error:")
stdin, stdout, stderr = ssh.exec_command("journalctl -u ironrisk --since '1 hour ago' --no-pager | grep -A 20 'uninstall' | grep -A 20 'Error\\|Traceback\\|Exception\\|line 134'")
print(stdout.read().decode())

# Check what line 1345 actually is on the server
print("\n2. Line 1345 of live.py on the server:")
stdin, stdout, stderr = ssh.exec_command("sed -n '1335,1355p' /var/www/ironrisk/backend/api/live.py")
print(stdout.read().decode())

# Check the DB state properly  
print("\n3. Database account status:")
stdin, stdout, stderr = ssh.exec_command("""
cd /var/www/ironrisk/backend && /var/www/ironrisk/backend/venv/bin/python3 -c "
from models.database import SessionLocal
from models.trading_account import TradingAccount
from datetime import datetime, timezone
db = SessionLocal()
accounts = db.query(TradingAccount).all()
for a in accounts:
    now = datetime.now(timezone.utc)
    elapsed = 'N/A'
    if a.last_heartbeat_at:
        hb = a.last_heartbeat_at
        if hb.tzinfo is None:
            hb = hb.replace(tzinfo=timezone.utc)
        elapsed = str(int((now - hb).total_seconds())) + 's ago'
    token_prefix = a.api_token[:25] if a.api_token else 'NONE'
    hostname = getattr(a, 'hostname', '?')
    print('  ID=' + a.id[:8] + '  name=' + str(a.name) + '  token=' + token_prefix + '  active=' + str(a.is_active) + '  connected=' + str(a.has_connected) + '  last_hb=' + elapsed + '  host=' + str(hostname))
db.close()
"
""")
out = stdout.read().decode().strip()
err = stderr.read().decode().strip()
print(out if out else "ERROR: " + err)

ssh.close()
