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
    print('User:', user.email)
    accounts = db.query(TradingAccount).filter(TradingAccount.user_id == user.id).all()
    print('Workspaces:')
    for a in accounts:
        print(f'\\n  [Account: {a.name} | ID: {a.id}]')
        strats = db.query(Strategy).filter(Strategy.trading_account_id == a.id).all()
        for s in strats:
            print(f'    - Strat: {s.name} | Magic: {s.magic_number} | ID: {s.id}')
else:
    print('User not found')
"
""")
print(stdout.read().decode())
print(stderr.read().decode())
ssh.close()
