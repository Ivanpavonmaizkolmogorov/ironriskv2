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
from models.strategy import Strategy
from models.trading_account import TradingAccount
db = SessionLocal()
acc = db.query(TradingAccount).filter(TradingAccount.id == '5e24af46-c448-46e5-bfb4-fddff032b958').first()
if acc:
    strats = db.query(Strategy).filter(Strategy.trading_account_id == acc.id).all()
    for s in strats:
        print(f'  ID: {s.id}, Name: {s.name}, Created: {s.created_at}')
"
""")
print(stdout.read().decode())
print(stderr.read().decode())
ssh.close()
