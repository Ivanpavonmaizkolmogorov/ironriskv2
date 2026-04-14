import paramiko, time, sys
sys.stdout.reconfigure(encoding='utf-8')

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('62.238.19.114', username='root', password='IronRisk_Production_2026!')

time.sleep(5)

stdin,stdout,stderr = ssh.exec_command('curl -s http://127.0.0.1:8001/health')
print("Health:", stdout.read().decode())

stdin,stdout,stderr = ssh.exec_command('journalctl -u ironrisk --no-pager -n 20')
print(stdout.read().decode())

stdin,stdout,stderr = ssh.exec_command('curl -s https://api.ironrisk.pro/health')
print("API domain:", stdout.read().decode())

ssh.close()
