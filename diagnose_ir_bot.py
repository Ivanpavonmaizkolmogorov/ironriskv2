"""Diagnose IronRisk Telegram bot."""
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
    err = stderr.read().decode('utf-8', errors='replace').strip()
    if out: print(out)
    if err: print(f"[STDERR] {err}")
    return out

# Check IronRisk telegram config
run("1. IronRisk .env telegram settings", "grep -i 'telegram\\|ENABLE' /var/www/ironrisk/backend/.env")

# Check if telegram poller is enabled
run("2. Telegram poller enabled?", "grep -i 'ENABLE_TELEGRAM' /var/www/ironrisk/backend/.env")

# Check IronRisk logs for telegram errors
run("3. Recent logs (telegram related)", "journalctl -u ironrisk --no-pager -n 100 | grep -i 'telegram\\|bot\\|poller\\|Conflict' | tail -20")

# Check all recent ironrisk logs
run("4. Recent ironrisk logs (last 30)", "journalctl -u ironrisk --no-pager -n 30")

# Check telegram bot service code
run("5. Telegram bot service - poller config", "grep -n 'ENABLE_TELEGRAM\\|telegram_bot_poller\\|run_polling\\|getUpdates' /var/www/ironrisk/backend/services/telegram_bot.py 2>/dev/null | head -20")

# Check settings model for ENABLE_TELEGRAM_POLLER
run("6. Settings model", "grep -n 'ENABLE_TELEGRAM' /var/www/ironrisk/backend/models/database.py 2>/dev/null")

# Both bots using getUpdates? Conflict!
run("7. Check both bot tokens", """
echo "IronRisk token:"; grep TELEGRAM_BOT_TOKEN /var/www/ironrisk/backend/.env;
echo "Nexo token:"; grep TELEGRAM_BOT_TOKEN /root/nexo/.env
""")

ssh.close()
print("\n\nDone.")
