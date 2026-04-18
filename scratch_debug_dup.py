import paramiko
import sys
import io

sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('62.238.19.114', username='root', password='IronRisk_Production_2026!')

# Move apt-daily-upgrade away from the 06:00 window
# Override the timer to run at 04:00 UTC instead
override = """[Timer]
OnCalendar=
OnCalendar=*-*-* 04:00
RandomizedDelaySec=30m
"""

stdin, stdout, stderr = ssh.exec_command("mkdir -p /etc/systemd/system/apt-daily-upgrade.timer.d")
stdout.read()

sftp = ssh.open_sftp()
with sftp.file('/etc/systemd/system/apt-daily-upgrade.timer.d/override.conf', 'w') as f:
    f.write(override)
sftp.close()

stdin, stdout, stderr = ssh.exec_command("systemctl daemon-reload")
stdout.read()

# Verify
stdin, stdout, stderr = ssh.exec_command("systemctl cat apt-daily-upgrade.timer 2>&1 | tail -10")
print("Timer config:")
print(stdout.read().decode().strip())

stdin, stdout, stderr = ssh.exec_command("systemctl list-timers apt-daily-upgrade.timer --no-pager")
print("\nNext run:")
print(stdout.read().decode().strip())

ssh.close()
print("\nDone. apt-daily-upgrade moved to 04:00 UTC (away from broadcast window).")
