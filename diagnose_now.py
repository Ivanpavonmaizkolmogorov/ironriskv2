"""Diagnose why api.ironrisk.pro is down."""
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import paramiko

HOST = '62.238.19.114'
USER = 'root'
PASS = 'IronRisk_Production_2026!'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=15)

commands = [
    ("1. IronRisk service status", "systemctl status ironrisk --no-pager 2>&1 || echo 'SERVICE NOT FOUND'"),
    ("2. Nginx status", "systemctl status nginx --no-pager 2>&1 || echo 'NGINX NOT FOUND'"),
    ("3. Nginx config test", "nginx -t 2>&1"),
    ("4. Nginx sites-enabled", "ls -la /etc/nginx/sites-enabled/ 2>&1"),
    ("5. Port 443 listeners", "ss -tlnp | grep ':443' 2>&1 || echo 'Nothing on 443'"),
    ("6. Port 8000 listeners", "ss -tlnp | grep ':8000' 2>&1 || echo 'Nothing on 8000'"),
    ("7. Port 80 listeners", "ss -tlnp | grep ':80 ' 2>&1 || echo 'Nothing on 80'"),
    ("8. IronRisk nginx config", "cat /etc/nginx/sites-enabled/ironrisk* 2>&1 || cat /etc/nginx/sites-available/ironrisk* 2>&1 || echo 'NO IRONRISK NGINX CONFIG'"),
    ("9. All nginx configs in sites-enabled", "for f in /etc/nginx/sites-enabled/*; do echo '=== '$f' ==='; cat $f; echo; done 2>&1"),
    ("10. IronRisk systemd unit", "cat /etc/systemd/system/ironrisk.service 2>&1 || echo 'NO SERVICE FILE'"),
    ("11. Recent ironrisk logs", "journalctl -u ironrisk --no-pager -n 30 2>&1 || echo 'NO LOGS'"),
    ("12. Python processes", "ps aux | grep -E 'uvicorn|gunicorn|python' | grep -v grep 2>&1 || echo 'No python processes'"),
    ("13. Disk space", "df -h / 2>&1"),
    ("14. Nexo related", "ls /var/www/nexo* 2>&1; ls /home/*/nexo* 2>&1; find / -maxdepth 3 -name 'nexo*' -type d 2>/dev/null | head -5"),
]

for title, cmd in commands:
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}")
    _, stdout, stderr = ssh.exec_command(cmd, timeout=10)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    if out.strip():
        print(out)
    if err.strip():
        print(f"[STDERR] {err}")

ssh.close()
print("\n\nDiagnosis complete.")
