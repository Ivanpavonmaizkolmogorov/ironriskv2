import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('62.238.19.114', username='root', password='IronRisk_Production_2026!')
script = """
import sys
sys.path.append('/var/www/ironrisk/backend')
from models.database import SessionLocal
from models.user_preferences import UserPreferences
from models.user import User

with SessionLocal() as db:
    for u in db.query(User).all():
        pref = db.query(UserPreferences).filter(UserPreferences.user_id == u.id).first()
        print(f'{u.email}: {pref.locale if pref else "None"}')
"""
stdin, stdout, stderr = ssh.exec_command(f'/var/www/ironrisk/backend/venv/bin/python3 -c \"{script}\"')
print(stdout.read().decode('utf-8'))
print(stderr.read().decode('utf-8'))
