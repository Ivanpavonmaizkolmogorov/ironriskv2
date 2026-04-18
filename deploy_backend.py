import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('62.238.19.114', username='root', password='IronRisk_Production_2026!')

sftp = ssh.open_sftp()
files = [
    (r"backend\api\admin.py", "/var/www/ironrisk/backend/api/admin.py"),
    (r"backend\api\live.py", "/var/www/ironrisk/backend/api/live.py"),
    (r"backend\services\notifications\alert_manager.py", "/var/www/ironrisk/backend/services/notifications/alert_manager.py"),
    (r"backend\services\humanizer.py", "/var/www/ironrisk/backend/services/humanizer.py"),
    (r"backend\services\telegram_bot.py", "/var/www/ironrisk/backend/services/telegram_bot.py"),
    (r"backend\services\translations.py", "/var/www/ironrisk/backend/services/translations.py"),
    (r"backend\services\stats\bayes_engine.py", "/var/www/ironrisk/backend/services/stats/bayes_engine.py"),
    (r"backend\services\risk_info_engine.py", "/var/www/ironrisk/backend/services/risk_info_engine.py")
]
for local, remote in files:
    print(f"  {local}")
    sftp.put(local, remote)
sftp.close()

print("Restarting...")
stdin, stdout, stderr = ssh.exec_command("systemctl restart ironrisk")
try:
    stdout.read()
except:
    pass
ssh.close()
print("Done.")
