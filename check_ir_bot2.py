"""Check IronRisk telegram bot handlers."""
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import paramiko

HOST = '62.238.19.114'
USER = 'root'
PASS = 'IronRisk_Production_2026!'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=15)

def run(title, cmd, timeout=15):
    print(f"\n{'='*60}")
    print(f"  {title}")
    print(f"{'='*60}")
    _, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    stdout.channel.recv_exit_status()
    out = stdout.read().decode('utf-8', errors='replace').strip()
    if out: print(out)
    return out

# See the full /start and /status handler
run("1. Full bot handler code (lines 260-350)",
    "sed -n '260,350p' /var/www/ironrisk/backend/services/telegram_bot.py")

# See the /status handler
run("2. /status handler",
    "grep -n -A 30 'cmd == \"/status\"' /var/www/ironrisk/backend/services/telegram_bot.py | head -40")

# See the /start handler
run("3. /start handler", 
    "grep -n -A 20 'cmd == \"/start\"' /var/www/ironrisk/backend/services/telegram_bot.py | head -25")

ssh.close()
print("\n\nDone.")
