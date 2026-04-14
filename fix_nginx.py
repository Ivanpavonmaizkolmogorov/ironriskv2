import paramiko, time, sys
sys.stdout.reconfigure(encoding='utf-8')

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('62.238.19.114', username='root', password='IronRisk_Production_2026!')

# Fix the Nginx proxy_pass to port 8000
stdin,stdout,stderr = ssh.exec_command("sed -i 's/proxy_pass http:\\/\\/127.0.0.1:8001/proxy_pass http:\\/\\/127.0.0.1:8000/' /etc/nginx/sites-available/ironrisk")
stdout.channel.recv_exit_status()

ssh.exec_command('systemctl reload nginx')
time.sleep(2)

stdin,stdout,stderr = ssh.exec_command('curl -s https://api.ironrisk.pro/health')
print("api.ironrisk.pro:", stdout.read().decode()[:200])

ssh.close()
