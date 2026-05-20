"""Check IronRisk bot - test getUpdates and see recent messages."""
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

# Check telegram logs more thoroughly
run("1. All telegram-related logs since restart", 
    "journalctl -u ironrisk --since '2026-05-10 17:57' --no-pager | grep -i 'telegram\\|bot\\|getUpdate\\|poller\\|Error\\|error' | tail -30")

# Test the bot API directly  
run("2. Test bot getMe", 
    "curl -s 'https://api.telegram.org/bot8685453163:AAE0f4T7qoERbalVrm6v3zUFJRzZ3agX2ps/getMe'")

# Check what the telegram bot code does
run("3. Bot handler code", 
    "grep -n 'def.*handle\\|async def.*process\\|/start\\|command\\|text.*==\\|reply' /var/www/ironrisk/backend/services/telegram_bot.py 2>/dev/null | head -20")

# Check if there's a webhook conflict
run("4. Check for webhooks", 
    "curl -s 'https://api.telegram.org/bot8685453163:AAE0f4T7qoERbalVrm6v3zUFJRzZ3agX2ps/getWebhookInfo'")

ssh.close()
print("\n\nDone.")
