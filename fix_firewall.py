"""Fix: Open ports 80 and 443 in UFW firewall for nginx."""
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
    ("1. Allow port 80 (HTTP)", "ufw allow 80/tcp"),
    ("2. Allow port 443 (HTTPS)", "ufw allow 443/tcp"),
    ("3. Verify firewall rules", "ufw status verbose"),
    ("4. Test IronRisk API locally", "curl -s -m 5 http://127.0.0.1:8000/health"),
]

for title, cmd in commands:
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}")
    _, stdout, stderr = ssh.exec_command(cmd, timeout=15)
    out = stdout.read().decode('utf-8', errors='replace')
    err = stderr.read().decode('utf-8', errors='replace')
    if out.strip():
        print(out)
    if err.strip():
        print(f"[STDERR] {err}")

ssh.close()
print("\n\nFirewall fix applied. Ports 80 and 443 are now open.")
