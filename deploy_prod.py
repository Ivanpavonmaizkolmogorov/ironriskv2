import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('62.238.19.114', username='root', password='IronRisk_Production_2026!')

print('Pulling code...')
_, out, err = ssh.exec_command('cd /var/www/ironrisk && git pull origin master')
print(out.read().decode())
print(err.read().decode())

print('Restarting backend...')
_, out, err = ssh.exec_command('systemctl restart ironrisk.service && systemctl status ironrisk.service | grep Active')
print(out.read().decode())

print('Rebuilding frontend (this may take a minute)...')
_, out, err = ssh.exec_command('cd /var/www/ironrisk/webapp && npm install && npm run build')
out_str = out.read().decode()
err_str = err.read().decode()

print('Checking frontend PM2...')
_, out, err = ssh.exec_command('pm2 restart all')
print(out.read().decode())

print('Done.')
ssh.close()
