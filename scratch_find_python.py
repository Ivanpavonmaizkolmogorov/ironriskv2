import paramiko

HOST = '62.238.19.114'
USER = 'root'
PASSWORD = 'IronRisk_Production_2026!'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASSWORD)

# Step 1: Find the systemd service config to know which python is used
print("=== SERVICE CONFIG ===")
stdin, stdout, stderr = ssh.exec_command("cat /etc/systemd/system/ironrisk.service")
print(stdout.read().decode())

# Step 2: Find python with sqlalchemy
print("=== FINDING PYTHON WITH SQLALCHEMY ===")
stdin, stdout, stderr = ssh.exec_command("find / -name 'python*' -path '*/bin/*' -type f 2>/dev/null | head -10")
print(stdout.read().decode())

ssh.close()
