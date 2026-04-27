import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('62.238.19.114', username='root', password='IronRisk_Production_2026!')

remote_script = """
import sys
sys.path.insert(0, '/var/www/ironrisk/backend')
from models.database import SessionLocal
from models.portfolio import Portfolio
db = SessionLocal()
portfolios = db.query(Portfolio).all()
for p in portfolios:
    rc = p.risk_config or {}
    lu = rc.get('last_updated', 'MISSING')
    dd = rc.get('max_drawdown', {})
    dd_cur = dd.get('current', 'MISSING')
    print(f'Portfolio: {p.name} | is_default={p.is_default} | last_updated={lu} | dd_current={dd_cur}')
db.close()
"""

stdin, stdout, stderr = ssh.exec_command(f'/var/www/ironrisk/backend/venv/bin/python3 -c """{remote_script}"""')
out = stdout.read().decode('utf-8', errors='replace')
print(out)
err = stderr.read().decode()
if err:
    print('STDERR:', err[-500:])
ssh.close()
