"""Deploy Nexo Telegram bot to server as a systemd service."""
import sys, io, os
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import paramiko
from paramiko import SFTPClient
from pathlib import Path

HOST = '62.238.19.114'
USER = 'root'
PASS = 'IronRisk_Production_2026!'
NEXO_LOCAL = Path(r'C:\Users\ivanp\proyectos\nexo')
NEXO_REMOTE = '/root/nexo'

SKIP_DIRS = {'venv', '__pycache__', '.git', '.pytest_cache', 'node_modules', '.next', 'logs'}
SKIP_FILES = {'.pyc'}

def upload_dir(sftp, local_dir, remote_dir, indent=0):
    """Recursively upload a directory."""
    prefix = "  " * indent
    for item in local_dir.iterdir():
        if item.name in SKIP_DIRS:
            continue
        if item.suffix in SKIP_FILES:
            continue
        remote_path = f"{remote_dir}/{item.name}"
        if item.is_dir():
            try:
                sftp.stat(remote_path)
            except FileNotFoundError:
                sftp.mkdir(remote_path)
                print(f"{prefix}[DIR] {remote_path}")
            upload_dir(sftp, item, remote_path, indent + 1)
        else:
            print(f"{prefix}[FILE] {remote_path}")
            sftp.put(str(item), remote_path)

# Connect
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=15)

def run(cmd, timeout=120):
    print(f"  >> {cmd}")
    _, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    exit_code = stdout.channel.recv_exit_status()
    out = stdout.read().decode('utf-8', errors='replace').strip()
    err = stderr.read().decode('utf-8', errors='replace').strip()
    if out:
        print(f"  {out}")
    if err and exit_code != 0:
        print(f"  [ERR] {err}")
    return out, exit_code

# ── Step 1: Create directories ──
print("\n=== STEP 1: Prepare remote directories ===")
run("mkdir -p /root/nexo/core /root/nexo/clientes /root/nexo/scripts")

# ── Step 2: Upload Nexo project files (core, clientes, .env, requirements) ──
print("\n=== STEP 2: Upload Nexo project ===")
sftp = ssh.open_sftp()

# Upload core/
print("Uploading core/...")
upload_dir(sftp, NEXO_LOCAL / 'core', f'{NEXO_REMOTE}/core')

# Upload clientes/
print("Uploading clientes/...")
upload_dir(sftp, NEXO_LOCAL / 'clientes', f'{NEXO_REMOTE}/clientes')

# Upload key files
for f in ['.env', 'requirements.txt', 'trabajos.jsonl']:
    local_f = NEXO_LOCAL / f
    if local_f.exists():
        print(f"Uploading {f}...")
        sftp.put(str(local_f), f'{NEXO_REMOTE}/{f}')

sftp.close()

# ── Step 3: Install bot dependencies in existing venv ──
print("\n=== STEP 3: Install dependencies ===")
run(f"source {NEXO_REMOTE}/venv/bin/activate && pip install -q python-telegram-bot pyyaml python-dotenv pdfplumber fpdf2 openpyxl requests matplotlib 2>&1 | tail -5", timeout=120)

# ── Step 4: Test that the bot can import ──
print("\n=== STEP 4: Test imports ===")
run(f"cd {NEXO_REMOTE} && source venv/bin/activate && python -c \"from core.notificaciones.telegram_bot import TelegramBot; print('Import OK')\"")

# ── Step 5: Create systemd service ──
print("\n=== STEP 5: Create nexo-bot systemd service ===")
service_content = f"""[Unit]
Description=Nexo Telegram Bot
After=network.target

[Service]
User=root
WorkingDirectory={NEXO_REMOTE}
EnvironmentFile={NEXO_REMOTE}/.env
ExecStart={NEXO_REMOTE}/venv/bin/python -m core.notificaciones.telegram_bot
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
"""

run(f"cat > /etc/systemd/system/nexo-bot.service << 'SERVICEEOF'\n{service_content}SERVICEEOF")
run("systemctl daemon-reload")
run("systemctl enable nexo-bot")
run("systemctl restart nexo-bot")

import time
time.sleep(3)

# ── Step 6: Verify ──
print("\n=== STEP 6: Verify ===")
run("systemctl is-active nexo-bot")
run("journalctl -u nexo-bot --no-pager -n 10")
run("ps aux | grep telegram | grep -v grep")

ssh.close()
print("\n\nDeploy complete!")
