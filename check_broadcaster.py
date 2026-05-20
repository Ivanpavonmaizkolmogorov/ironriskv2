"""Check daily broadcaster - focused."""
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
    print(f"\n  {title}")
    _, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    stdout.channel.recv_exit_status()
    out = stdout.read().decode('utf-8', errors='replace').strip()
    if out: print(f"  {out}")

run("1. Broadcaster function:", 
    "grep -n -A 30 'async def daily_status_broadcaster' /var/www/ironrisk/backend/services/telegram_bot.py")
run("2. Server time:", "date")
run("3. Timezone:", "cat /etc/timezone 2>/dev/null || timedatectl show -p Timezone --value")
run("4. ENABLE_TELEGRAM_POLLER default:",
    "grep ENABLE_TELEGRAM /var/www/ironrisk/backend/models/database.py")

ssh.close()
