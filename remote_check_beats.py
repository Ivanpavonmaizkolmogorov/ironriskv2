import paramiko

HOST = '62.238.19.114'
USER = 'root'
PASSWORD = 'IronRisk_Production_2026!'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASSWORD)

stdin, stdout, stderr = ssh.exec_command("journalctl -u ironrisk.service --since '5 minutes ago' --no-pager | grep heartbeat")
print("HEARTBEATS:\n", stdout.read().decode('utf-8'))
ssh.close()
