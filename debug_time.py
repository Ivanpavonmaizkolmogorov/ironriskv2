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
engine = create_engine(DATABASE_URL)
db = sessionmaker(bind=engine)()
for row in db.execute(text("SELECT id, name, created_at FROM trading_accounts")).fetchall():
    print(row)
"""

print("[INFO] Creating remote script...")
stdin, stdout, stderr = ssh.exec_command(f"cat << 'EOF' > /root/debug_time.py\n{script}EOF")
stdout.read()

print("[INFO] Running remote script...")
stdin, stdout, stderr = ssh.exec_command("/var/www/ironrisk/backend/venv/bin/python /root/debug_time.py")
print(stdout.read().decode('utf-8'))
print(stderr.read().decode('utf-8'))
ssh.close()
