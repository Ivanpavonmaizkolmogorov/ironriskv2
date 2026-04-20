import paramiko

HOST = '62.238.19.114'
USER = 'root'
PASSWORD = 'IronRisk_Production_2026!'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASSWORD)

script = """
import logging
print("[INFO] Fetching access logs for registration or account creation...")
stdin, stdout, stderr = ssh.exec_command("journalctl -u ironrisk.service --since '15 minutes ago' --no-pager | grep -E 'register|trading-accounts'")
print(stdout.read().decode('utf-8'))
print(stderr.read().decode('utf-8'))
"""

print("[INFO] Creating remote script...")
stdin, stdout, stderr = ssh.exec_command(f"cat << 'EOF' > /root/debug_db.py\n{script}EOF")
stdout.read()

print("[INFO] Running remote script...")
stdin, stdout, stderr = ssh.exec_command("/var/www/ironrisk/backend/venv/bin/python /root/debug_db.py")
print(stdout.read().decode('utf-8'))
print(stderr.read().decode('utf-8'))

ssh.close()
