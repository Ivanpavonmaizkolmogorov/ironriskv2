"""Diagnose production server state (encoding-safe)."""
import paramiko
import sys
sys.stdout.reconfigure(encoding='utf-8', errors='replace')

HOST = '62.238.19.114'
USER = 'root'
PASSWORD = 'IronRisk_Production_2026!'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASSWORD)

def run(cmd):
    print(f"\n>>> {cmd}")
    _, out, err = ssh.exec_command(cmd)
    o = out.read().decode('utf-8', errors='replace').strip()
    e = err.read().decode('utf-8', errors='replace').strip()
    if o: print(o)
    if e: print(f"[STDERR] {e}")
    return o

# 1. Check backend service
run("systemctl status ironrisk.service | head -10")

# 2. Check if webapp exists
run("ls -la /var/www/ironrisk/webapp/ 2>/dev/null || echo 'NO WEBAPP DIR'")

# 3. Check PM2 + Node
run("which pm2 2>/dev/null || echo 'PM2 NOT FOUND'")
run("which node 2>/dev/null || echo 'NODE NOT FOUND'")
run("node --version 2>/dev/null || echo 'NO NODE'")

# 4. Check git
run("which git 2>/dev/null || echo 'GIT NOT INSTALLED'")
run("git --version 2>/dev/null || echo 'NO GIT'")

# 5. Nginx frontend config
run("cat /etc/nginx/sites-enabled/ironrisk 2>/dev/null || cat /etc/nginx/sites-enabled/default 2>/dev/null | head -60")

# 6. Check what's on port 3000 (frontend) and 8000 (backend)
run("ss -tlnp | grep -E ':3000|:8000|:80|:443'")

# 7. Disk space
run("df -h /var/www/")

# 8. Check Vercel/external frontend config
run("cat /var/www/ironrisk/backend/.env")

ssh.close()
print("\n--- DIAGNOSIS COMPLETE ---")
