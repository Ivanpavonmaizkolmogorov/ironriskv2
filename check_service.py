import paramiko

HOST = '62.238.19.114'
USER = 'root'
PASSWORD = 'IronRisk_Production_2026!'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASSWORD)

import sys
sys.stdout.reconfigure(encoding='utf-8')
stdin, stdout, stderr = ssh.exec_command("systemctl status ironrisk")
print(stdout.read().decode('utf-8'))
ssh.close()
