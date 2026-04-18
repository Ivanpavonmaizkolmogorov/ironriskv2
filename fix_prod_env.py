import paramiko
import sys

HOST = '62.238.19.114'
USER = 'root'
PASSWORD = 'IronRisk_Production_2026!'

print("Conectando a Hetzner para actualizar .env de prod...")
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASSWORD)

stdin, stdout, stderr = ssh.exec_command('grep ENABLE_TELEGRAM_POLLER /var/www/ironrisk/backend/.env')
out = stdout.read().decode().strip()

if 'ENABLE_TELEGRAM_POLLER' not in out:
    print("Añadiendo ENABLE_TELEGRAM_POLLER=true a .env...")
    ssh.exec_command("echo 'ENABLE_TELEGRAM_POLLER=true' >> /var/www/ironrisk/backend/.env")
else:
    print("La variable ENABLE_TELEGRAM_POLLER ya existe en el .env.")

print("Reiniciando ironrisk...")
ssh.exec_command("systemctl restart ironrisk")

print("Listo!")
ssh.close()
