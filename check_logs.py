import paramiko

HOST = '62.238.19.114'
USER = 'root'
PASSWORD = 'IronRisk_Production_2026!'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASSWORD)

print("1. Check if Watchdog is running in logs")
stdin, stdout, stderr = ssh.exec_command("journalctl -u ironrisk --since '1 hour ago' --no-pager | grep -i watchdog")
print(stdout.read().decode())

print("\n2. Check if Telegram Poller is running")
stdin, stdout, stderr = ssh.exec_command("journalctl -u ironrisk --since '1 hour ago' --no-pager | grep -i 'telegram bot poller started'")
print(stdout.read().decode())

ssh.close()
