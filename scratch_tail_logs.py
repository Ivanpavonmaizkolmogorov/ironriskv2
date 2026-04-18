import paramiko
import sys

HOST = '62.238.19.114'
USER = 'root'
PASSWORD = 'IronRisk_Production_2026!'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASSWORD)

print("Fetching last 50 lines of journalctl...")
stdin, stdout, stderr = ssh.exec_command("journalctl -u ironrisk --no-pager -n 50")
print(stdout.read().decode())

print("Querying the backend SQLite directly to see trading_accounts hostnames and duplication flags...")
sql_command = "sqlite3 /var/www/ironrisk/ironrisk.db \"SELECT id, name, hostname, last_heartbeat_at, default_dashboard_layout FROM trading_accounts;\""
stdin, stdout, stderr = ssh.exec_command(sql_command)
print("--- DB RESULTS ---")
print(stdout.read().decode())
print("--- DB ERROR ---")
print(stderr.read().decode())

ssh.close()
