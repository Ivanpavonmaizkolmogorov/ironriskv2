"""Restart ironrisk with proper timeout handling."""
import sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
import paramiko
import time

HOST = '62.238.19.114'
USER = 'root'
PASS = 'IronRisk_Production_2026!'

def run_cmd(ssh, cmd, timeout=60):
    print(f"  >> {cmd}")
    _, stdout, stderr = ssh.exec_command(cmd, timeout=timeout)
    exit_status = stdout.channel.recv_exit_status()
    out = stdout.read().decode('utf-8', errors='replace').strip()
    err = stderr.read().decode('utf-8', errors='replace').strip()
    if out:
        print(f"  {out}")
    if err:
        print(f"  [ERR] {err}")
    print(f"  exit={exit_status}")
    return out

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=15)

# Step 1: Kill the bloated process, then restart
print("\n=== STEP 1: Force kill old ironrisk process ===")
run_cmd(ssh, "systemctl stop ironrisk; sleep 2; systemctl start ironrisk", timeout=60)

print("\n=== STEP 2: Wait for startup ===")
time.sleep(8)

# Reconnect in case connection was disrupted
ssh.close()
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASS, timeout=15)

print("\n=== STEP 3: Verify services ===")
run_cmd(ssh, "systemctl is-active ironrisk")
run_cmd(ssh, "systemctl is-active nginx")

print("\n=== STEP 4: Check ports ===")
run_cmd(ssh, "ss -tlnp | grep -E ':80 |:443 |:8000 '")

print("\n=== STEP 5: Test API locally ===")
run_cmd(ssh, "curl -s -m 10 http://127.0.0.1:8000/health")

print("\n=== STEP 6: Test API via HTTPS ===")
run_cmd(ssh, "curl -s -m 10 https://api.ironrisk.pro/health")

print("\n=== STEP 7: Recent logs ===")
run_cmd(ssh, "journalctl -u ironrisk --no-pager -n 15")

print("\n=== STEP 8: Memory after restart ===")
run_cmd(ssh, "ps aux | grep uvicorn | grep -v grep")

ssh.close()
print("\n\nDone!")
