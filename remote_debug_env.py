import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('62.238.19.114', username='root', password='IronRisk_Production_2026!')

cmd = "cd /var/www/ironrisk/backend && /var/www/ironrisk/backend/venv/bin/python -c 'import os; from dotenv import load_dotenv; load_dotenv(); print(os.getenv(\"DATABASE_URL\")); from models.database import get_settings; print(get_settings().DATABASE_URL)'"
_, stdout, stderr = ssh.exec_command(cmd)

print("STDOUT:", stdout.read().decode('utf-8'))
print("STDERR:", stderr.read().decode('utf-8'))
ssh.close()
