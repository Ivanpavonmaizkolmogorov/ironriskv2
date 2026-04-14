import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('62.238.19.114', username='root', password='IronRisk_Production_2026!')

# Add SMTP credentials to .env
commands = [
    'echo "SMTP_EMAIL=ironrisk.shield@gmail.com" >> /var/www/ironrisk/backend/.env',
    'echo "SMTP_PASSWORD=ntbtolrpcltefncq" >> /var/www/ironrisk/backend/.env',
    'systemctl restart ironrisk',
]

for cmd in commands:
    print(f"Running: {cmd}")
    stdin, stdout, stderr = ssh.exec_command(cmd)
    stdout.channel.recv_exit_status()

time.sleep(2)

# Verify
stdin, stdout, stderr = ssh.exec_command('cat /var/www/ironrisk/backend/.env')
print("\n.env contents:")
print(stdout.read().decode())

stdin, stdout, stderr = ssh.exec_command('systemctl is-active ironrisk')
print("Service status:", stdout.read().decode().strip())

ssh.close()
