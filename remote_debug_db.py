import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('62.238.19.114', username='root', password='IronRisk_Production_2026!')

cmd = "cd /var/www/ironrisk/backend && /var/www/ironrisk/backend/venv/bin/python -c 'import sys; sys.path.insert(0, \".\"); from models.database import SessionLocal; from models.waitlist import WaitlistLead; db = SessionLocal(); leads=db.query(WaitlistLead).all(); print(\"Total leads:\", len(leads)); [print(l.email, getattr(l, \"approved_at\", None)) for l in leads]'"
_, stdout, stderr = ssh.exec_command(cmd)

print("STDOUT:", stdout.read().decode('utf-8'))
print("STDERR:", stderr.read().decode('utf-8'))
ssh.close()
