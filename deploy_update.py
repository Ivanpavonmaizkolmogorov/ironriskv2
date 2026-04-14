import paramiko
import os

HOST = '62.238.19.114'
USER = 'root'
PASSWORD = 'IronRisk_Production_2026!'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASSWORD)

# 1. Install psutil
print("Installing psutil...")
stdin, stdout, stderr = ssh.exec_command('/var/www/ironrisk/backend/venv/bin/pip install psutil')
print(stdout.read().decode())

# 2. Upload the updated admin.py
print("Uploading updated admin.py...")
sftp = ssh.open_sftp()
local_admin = os.path.join(os.path.dirname(__file__), 'backend', 'api', 'admin.py')
sftp.put(local_admin, '/var/www/ironrisk/backend/api/admin.py')
sftp.close()

# 3. Restart the service
print("Restarting IronRisk service...")
stdin, stdout, stderr = ssh.exec_command('systemctl restart ironrisk')
exit_code = stdout.channel.recv_exit_status()
print(f"Restart exit code: {exit_code}")

# 4. Verify it's running
import time
time.sleep(2)
stdin, stdout, stderr = ssh.exec_command('systemctl is-active ironrisk')
status = stdout.read().decode().strip()
print(f"Service status: {status}")

ssh.close()
print("Done!")
