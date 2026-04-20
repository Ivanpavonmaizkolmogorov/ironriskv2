import paramiko

HOST = '62.238.19.114'
USER = 'root'
PASSWORD = 'IronRisk_Production_2026!'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASSWORD)

stdin, stdout, stderr = ssh.exec_command("grep -r 'irk_89a' /var/lib/postgresql/ /var/www/ironrisk/ /tmp/ /var/log/ 2>/dev/null")
print(stdout.read().decode('utf-8'))
ssh.close()
