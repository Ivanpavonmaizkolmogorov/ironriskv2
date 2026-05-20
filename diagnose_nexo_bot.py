"""Diagnose Nexo Telegram bot issues."""
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import paramiko

HOST = '62.238.19.114'
USER = 'root'
PASS = 'IronRisk_Production_2026!'

def run_cmd(ssh, title, cmd, timeout=15):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}")
    _, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    stdout.channel.recv_exit_status()
    out = stdout.read().decode('utf-8', errors='replace').strip()
    err = stderr.read().decode('utf-8', errors='replace').strip()
    if out:
        print(out)
    if err:
        print(f"[STDERR] {err}")
    return out

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=15)

run_cmd(ssh, "1. Nexo full server.py", "cat /root/nexo/server.py")
run_cmd(ssh, "2. Nexo project structure", "find /root/nexo -maxdepth 3 -not -path '*/venv/*' -not -path '*/node_modules/*' -not -path '*/.next/*' | head -50")
run_cmd(ssh, "3. Any telegram files in nexo?", "find /root/nexo -name '*telegram*' -not -path '*/venv/*' 2>/dev/null")
run_cmd(ssh, "4. Any bot files in nexo?", "find /root/nexo -name '*bot*' -not -path '*/venv/*' 2>/dev/null")
run_cmd(ssh, "5. Nexo .env or config", "find /root/nexo -name '.env' -o -name 'config.yaml' -o -name '*.env*' 2>/dev/null | head -10")
run_cmd(ssh, "6. All python processes", "ps aux | grep python | grep -v grep")
run_cmd(ssh, "7. IronRisk telegram token in backend .env", "grep TELEGRAM /var/www/ironrisk/backend/.env 2>/dev/null")
run_cmd(ssh, "8. Nexo data dir", "ls -la /root/nexo/data/ 2>/dev/null")
run_cmd(ssh, "9. Check if nexo bot is separate process", "ps aux | grep -i telegram | grep -v grep")

ssh.close()
print("\n\nDone.")
