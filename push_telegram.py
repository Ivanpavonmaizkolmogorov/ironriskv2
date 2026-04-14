import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('62.238.19.114', username='root', password='IronRisk_Production_2026!')

# Add Telegram token
cmd = 'echo "TELEGRAM_BOT_TOKEN=8685453163:AAE0f4T7qoERbalVrm6v3zUFJRzZ3agX2ps" >> /var/www/ironrisk/backend/.env'
stdin, stdout, stderr = ssh.exec_command(cmd)
stdout.channel.recv_exit_status()

# Restart service
ssh.exec_command('systemctl restart ironrisk')
time.sleep(2)

# Verify
stdin, stdout, stderr = ssh.exec_command('cat /var/www/ironrisk/backend/.env')
print(".env:")
print(stdout.read().decode())

stdin, stdout, stderr = ssh.exec_command('systemctl is-active ironrisk')
print("Status:", stdout.read().decode().strip())

ssh.close()
