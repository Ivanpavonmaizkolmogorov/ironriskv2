import paramiko, time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('62.238.19.114', username='root', password='IronRisk_Production_2026!')

ssh.exec_command('systemctl restart ironrisk')
ssh.exec_command('systemctl restart nginx')
time.sleep(3)

stdin,stdout,stderr = ssh.exec_command('systemctl is-active ironrisk')
print('IronRisk:', stdout.read().decode().strip())

stdin,stdout,stderr = ssh.exec_command('systemctl is-active nginx')
print('Nginx:', stdout.read().decode().strip())

stdin,stdout,stderr = ssh.exec_command('curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:8001/health')
print('Backend local:', stdout.read().decode().strip())

stdin,stdout,stderr = ssh.exec_command('curl -s -o /dev/null -w "%{http_code}" https://api.ironrisk.pro/health')
print('api.ironrisk.pro:', stdout.read().decode().strip())

ssh.close()
