import paramiko

HOST = '62.238.19.114'
USER = 'root'
PASSWORD = 'IronRisk_Production_2026!'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASSWORD)

script = """
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
import sys
sys.stdout.reconfigure(encoding='utf-8')

DATABASE_URL = "postgresql://ironrisk_user:ouu7-iHet06AxyAMZvNw-g@localhost:5432/ironrisk"
try:
    db = sessionmaker(bind=create_engine(DATABASE_URL))()
    rows = db.execute(text("SELECT id, email, created_at FROM users ORDER BY created_at DESC")).fetchall()
    print("ALL USERS:")
    for row in rows:
        print(row)
except Exception as e:
    print(e)
"""

stdin, stdout, stderr = ssh.exec_command(f"cat << 'EOF' > /root/dump_users.py\n{script}EOF")
stdout.read()

stdin, stdout, stderr = ssh.exec_command("/var/www/ironrisk/backend/venv/bin/python /root/dump_users.py")
print(stdout.read().decode('utf-8'))
print(stderr.read().decode('utf-8'))
ssh.close()
