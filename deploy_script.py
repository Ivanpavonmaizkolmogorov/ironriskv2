import paramiko
import os

HOST = '62.238.19.114'
USER = 'root'
PASSWORD = 'IronRisk_Production_2026!'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASSWORD)

sftp = ssh.open_sftp()
base_dir = os.path.dirname(__file__)

local_path = os.path.join(base_dir, 'backend', 'api', 'live.py')
remote_path = '/var/www/ironrisk/backend/api/live.py'
print(f"Uploading {local_path} to {remote_path}...")
sftp.put(local_path, remote_path)
sftp.close()

print("Restarting ironrisk backend...")
ssh.exec_command('systemctl restart ironrisk')

import time
time.sleep(2)
stdin, stdout, stderr = ssh.exec_command('systemctl is-active ironrisk')
print(f"Status: {stdout.read().decode().strip()}")

ssh.close()
print("Done!")
