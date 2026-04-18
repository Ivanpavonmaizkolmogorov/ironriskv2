import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('62.238.19.114', username='root', password='IronRisk_Production_2026!')

sftp = ssh.open_sftp()
files = [
    (r"backend\services\telegram_bot.py", "/var/www/ironrisk/backend/services/telegram_bot.py"),
    (r"backend\api\admin.py", "/var/www/ironrisk/backend/api/admin.py"),
    (r"backend\api\preferences.py", "/var/www/ironrisk/backend/api/preferences.py"),
]
for local, remote in files:
    print(f"  {local}")
    sftp.put(local, remote)
sftp.close()

print("Restarting...")
stdin, stdout, stderr = ssh.exec_command("systemctl restart ironrisk")
stdout.read(); stderr.read()
ssh.close()
print("Done.")
