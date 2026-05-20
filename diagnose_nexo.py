"""Diagnose Nexo status on the server."""
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
    exit_status = stdout.channel.recv_exit_status()
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

run_cmd(ssh, "1. Is Nexo process running?", "ps aux | grep -E 'nexo|streamlit|8501' | grep -v grep")
run_cmd(ssh, "2. Port 8501 listening?", "ss -tlnp | grep 8501")
run_cmd(ssh, "3. Nexo as systemd service?", "systemctl status nexo --no-pager 2>&1 || echo 'No systemd service'")
run_cmd(ssh, "4. Nexo directory contents", "ls -la /root/nexo/")
run_cmd(ssh, "5. Nexo server.py", "cat /root/nexo/server.py 2>&1 | head -30")
run_cmd(ssh, "6. Test localhost:8501", "curl -s -m 5 -o /dev/null -w '%{http_code}' http://127.0.0.1:8501/ 2>&1")
run_cmd(ssh, "7. Nexo .env", "cat /root/nexo/.env 2>&1 | head -20")
run_cmd(ssh, "8. Any nginx config for nexo?", "grep -r 'nexo\\|8501' /etc/nginx/ 2>&1 || echo 'None'")
run_cmd(ssh, "9. Firewall check 8501", "ufw status | grep 8501")
run_cmd(ssh, "10. How was nexo started? (check nohup/screen/tmux)", "ls -la /root/nexo/nohup.out 2>&1; screen -ls 2>&1; tmux ls 2>&1")
run_cmd(ssh, "11. Nexo logs (if systemd)", "journalctl -u nexo --no-pager -n 20 2>&1 || echo 'No journal'")
run_cmd(ssh, "12. Any error in nexo process?", "cat /root/nexo/*.log 2>&1 | tail -30 || echo 'No log files'")

ssh.close()
print("\n\nNexo diagnosis complete.")
