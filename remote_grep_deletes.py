import paramiko

HOST = '62.238.19.114'
USER = 'root'
PASSWORD = 'IronRisk_Production_2026!'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASSWORD)

stdin, stdout, stderr = ssh.exec_command("cat /var/log/syslog | grep '147.221' | grep 'DELETE /api/trading-accounts/'")
print("DELETES:\n", stdout.read().decode('utf-8'))
ssh.close()
