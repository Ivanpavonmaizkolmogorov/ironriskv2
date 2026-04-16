"""Deploy VPS Hostname feature to production Hetzner server.
1. Read production DATABASE_URL from remote .env
2. Run ALTER TABLE to add hostname column
3. Upload all modified backend files
4. Restart the service
"""
import paramiko
import os
import time

HOST = '62.238.19.114'
USER = 'root'
PASSWORD = 'IronRisk_Production_2026!'

def run_cmd(ssh, cmd, ignore_err=False):
    print(f"[SERVER] {cmd}")
    stdin, stdout, stderr = ssh.exec_command(cmd)
    exit_code = stdout.channel.recv_exit_status()
    out = stdout.read().decode().strip()
    err = stderr.read().decode().strip()
    if out:
        print(f"  > {out}")
    if err and not ignore_err:
        print(f"  WARN: {err}")
    if exit_code != 0 and not ignore_err:
        raise Exception(f"Command failed (exit {exit_code}): {cmd}")
    return out

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
print(f"Connecting to {HOST}...")
ssh.connect(HOST, username=USER, password=PASSWORD)

# 1. Read production .env to get DATABASE_URL
print("\n--- 1. Reading production DATABASE_URL ---")
db_url = run_cmd(ssh, "grep DATABASE_URL /var/www/ironrisk/backend/.env | head -1")
print(f"  DB config: {db_url[:50]}...")

# 2. Run ALTER TABLE on production PostgreSQL
print("\n--- 2. Adding hostname column to trading_accounts ---")
alter_sql = "ALTER TABLE trading_accounts ADD COLUMN IF NOT EXISTS hostname VARCHAR(100);"
run_cmd(ssh, f'sudo -u postgres psql -d ironrisk -c "{alter_sql}"', ignore_err=True)

# 3. Verify the column exists
print("\n--- 3. Verifying column exists ---")
verify = run_cmd(ssh, "sudo -u postgres psql -d ironrisk -c \"SELECT column_name FROM information_schema.columns WHERE table_name='trading_accounts' AND column_name='hostname';\"")
if 'hostname' in verify:
    print("  OK: Column 'hostname' confirmed in production DB!")
else:
    print("  FAIL: Column not found - manual intervention needed")

# 4. Upload all modified backend files
print("\n--- 4. Uploading modified files ---")
sftp = ssh.open_sftp()

base = os.path.join(os.path.dirname(__file__), 'backend')
remote_base = '/var/www/ironrisk/backend'

files_to_upload = [
    ('api/live.py', 'api/live.py'),
    ('schemas/live.py', 'schemas/live.py'),
    ('schemas/trading_account.py', 'schemas/trading_account.py'),
    ('models/trading_account.py', 'models/trading_account.py'),
]

for local_rel, remote_rel in files_to_upload:
    local_path = os.path.join(base, local_rel)
    remote_path = f"{remote_base}/{remote_rel}"
    print(f"  Uploading: {local_rel}")
    sftp.put(local_path, remote_path)

sftp.close()

# 5. Restart the service
print("\n--- 5. Restarting IronRisk service ---")
run_cmd(ssh, "systemctl restart ironrisk")
time.sleep(3)
status = run_cmd(ssh, "systemctl is-active ironrisk")
print(f"  Service status: {status}")

if status == 'active':
    print("\nDEPLOY COMPLETE - VPS Hostname feature is LIVE!")
else:
    print("\nFAIL: Service not active - check logs with: journalctl -u ironrisk -n 50")
    logs = run_cmd(ssh, "journalctl -u ironrisk -n 20 --no-pager", ignore_err=True)
    print(logs)

ssh.close()
