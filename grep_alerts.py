import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('62.238.19.114', username='root', password='IronRisk_Production_2026!')
stdin, stdout, stderr = ssh.exec_command("journalctl -u ironrisk --since '15 minutes ago' --no-pager | grep trigger-alert")
print(stdout.read().decode('utf-8'))
