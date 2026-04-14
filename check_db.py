import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('62.238.19.114', username='root', password='IronRisk_Production_2026!')

cmd = 'sudo -u postgres psql -d ironrisk -c "SELECT email, hashed_password FROM users;"'
stdin, stdout, stderr = ssh.exec_command(cmd)

print("OUT:", stdout.read().decode())
print("ERR:", stderr.read().decode())
