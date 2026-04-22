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
acc = db.query(TradingAccount).filter(TradingAccount.name == 'DemoOficial').first()
if acc:
    strats = db.query(Strategy).filter(Strategy.trading_account_id == acc.id).all()
    for s in strats:
        if str(s.magic_number) in ['40', '3', '86'] or '40' in s.name or '3' in s.name or '86' in s.name:
            print(f'   - {s.name} (Magic {s.magic_number}) | Created: {s.created_at}')
"
""")
print(stdout.read().decode())
print(stderr.read().decode())
ssh.close()
