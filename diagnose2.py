"""Deeper diagnosis - firewall, nginx, and connectivity."""
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
    ("1. Firewall status (ufw)", "ufw status verbose 2>&1"),
    ("2. Firewall status (iptables 443)", "iptables -L INPUT -n --line-numbers 2>&1 | head -30"),
    ("3. Nginx running?", "systemctl is-active nginx 2>&1"),
    ("4. Nginx error log (last 20)", "tail -20 /var/log/nginx/error.log 2>&1"),
    ("5. Nginx access log (last 10)", "tail -10 /var/log/nginx/access.log 2>&1"),
    ("6. Test localhost:8000 from server", "curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:8000/ 2>&1"),
    ("7. Test localhost:8000 health", "curl -s http://127.0.0.1:8000/health 2>&1"),
    ("8. SSL cert expiry", "openssl x509 -enddate -noout -in /etc/letsencrypt/live/api.ironrisk.pro/fullchain.pem 2>&1"),
    ("9. All listening ports", "ss -tlnp | head -20 2>&1"),
    ("10. IronRisk service active?", "systemctl is-active ironrisk 2>&1"),
    ("11. Nexo server.py - what port?", "head -50 /root/nexo/server.py 2>&1"),
    ("12. Any port conflicts?", "ss -tlnp | grep -E ':80 |:443 |:8000 ' 2>&1"),
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
print("\nDiagnosis 2 complete.")
