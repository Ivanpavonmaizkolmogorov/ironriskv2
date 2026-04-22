import paramiko
import sys

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('62.238.19.114', username='root', password='IronRisk_Production_2026!')
stdin, stdout, stderr = ssh.exec_command("""
cd /var/www/ironrisk/backend && /var/www/ironrisk/backend/venv/bin/python3 -c "
import sys
sys.path.append('.')
from models.database import SessionLocal
from models.user import User
from models.trading_account import TradingAccount
from models.strategy import Strategy

db = SessionLocal()
user = db.query(User).filter(User.email == 'ivanpavonmaiz@gmail.com').first()
if user:
    print(f'User: {user.email}')
    accounts = db.query(TradingAccount).filter(TradingAccount.user_id == user.id).all()
    for a in accounts:
        print(f'\\n[Workspace: {a.name} | Created: {a.created_at} | ID: {a.id}]')
        strats = db.query(Strategy).filter(Strategy.trading_account_id == a.id).order_by(Strategy.created_at.asc()).all()
        for s in strats:
            print(f'   - {s.name} (Magic {s.magic_number}) | Created: {s.created_at}')
else:
    print('User not found')
"
""")
print(stdout.read().decode())
print(stderr.read().decode())
ssh.close()
