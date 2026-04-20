import paramiko

HOST = '62.238.19.114'
USER = 'root'
PASSWORD = 'IronRisk_Production_2026!'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASSWORD)

print("[INFO] Fetching service...")
stdin, stdout, stderr = ssh.exec_command("cat /etc/systemd/system/ironrisk.service")
print(stdout.read().decode('utf-8'))
print(stderr.read().decode('utf-8'))
