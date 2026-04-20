import paramiko

HOST = '62.238.19.114'
USER = 'root'
PASSWORD = 'IronRisk_Production_2026!'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASSWORD)

script = """
import sys
sys.path.append('/var/www/ironrisk/backend')
import os
os.chdir('/var/www/ironrisk/backend')

from models.database import get_settings, SessionLocal, engine
from models.user import User

print("Settings DATABASE_URL:", get_settings().DATABASE_URL)
with SessionLocal() as db:
    count = db.query(User).count()
    print("User count in API's exact DB:", count)
    
    users = db.query(User).order_by(User.created_at.desc()).limit(3).all()
    for u in users:
        print("Last users:", u.email, u.created_at)
"""

stdin, stdout, stderr = ssh.exec_command(f"cat << 'EOF' > /root/check_db_exact.py\n{script}EOF")
stdout.read()

stdin, stdout, stderr = ssh.exec_command("cd /var/www/ironrisk/backend && /var/www/ironrisk/backend/venv/bin/python /root/check_db_exact.py")
print(stdout.read().decode('utf-8'))
print(stderr.read().decode('utf-8'))
ssh.close()
