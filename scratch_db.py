import paramiko
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('62.238.19.114', username='root', password='IronRisk_Production_2026!')

print("Checking alert config cooldown...")
stdin, stdout, stderr = ssh.exec_command("""
sudo -u postgres psql -d ironrisk -c "SELECT id, metric_key, cooldown_minutes FROM user_alert_configs;"
""")
print(stdout.read().decode())
ssh.close()
