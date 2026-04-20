import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('62.238.19.114', username='root', password='IronRisk_Production_2026!')

print('Checking git directories...')
_, out, err = ssh.exec_command('find / -name .git -type d 2>/dev/null')
print(out.read().decode())

ssh.close()
