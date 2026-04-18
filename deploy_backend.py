import paramiko

HOST = '62.238.19.114'
USER = 'root'
PASSWORD = 'IronRisk_Production_2026!'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASSWORD)

sftp = ssh.open_sftp()

files = [
    (r"backend\services\telegram_bot.py", "/var/www/ironrisk/backend/services/telegram_bot.py"),
    (r"backend\api\preferences.py", "/var/www/ironrisk/backend/api/preferences.py"),
]

for local, remote in files:
    print(f"Uploading {local}...")
    sftp.put(local, remote)

sftp.close()

print("Restarting ironrisk service...")
stdin, stdout, stderr = ssh.exec_command("systemctl restart ironrisk")
stdout.read()
stderr.read()

import time
time.sleep(2)

# Verify broadcaster initialized
stdin, stdout, stderr = ssh.exec_command("journalctl -u ironrisk --no-pager -n 10 | grep -i 'broadcast\\|poller\\|started'")
print("Post-restart logs:")
print(stdout.read().decode('ascii', errors='replace').strip())

ssh.close()
print("\nDeployment complete.")
