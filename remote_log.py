import paramiko

HOST = '62.238.19.114'
USER = 'root'
PASSWORD = 'IronRisk_Production_2026!'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASSWORD)

print("[INFO] Error 401 logs from server:")
stdin, stdout, stderr = ssh.exec_command("journalctl -u ironrisk.service --since '30 minutes ago' --no-pager | grep 401")
print(stdout.read().decode('utf-8'))
print(stderr.read().decode('utf-8'))

# also check if the token length or payload sent by EA has any oddities
print("[INFO] Any ValueError or KeyError or ValidationError logs:")
stdin, stdout, stderr = ssh.exec_command("journalctl -u ironrisk.service --since '30 minutes ago' --no-pager | grep -E 'Error|Exception|Failed'")
print(stdout.read().decode('utf-8'))

ssh.close()
