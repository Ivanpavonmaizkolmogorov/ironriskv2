import paramiko

HOST = '62.238.19.114'
USER = 'root'
PASSWORD = 'IronRisk_Production_2026!'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASSWORD)

sftp = ssh.open_sftp()
print("Uploading preferences.py (locale endpoint)...")
sftp.put(r"backend\api\preferences.py", "/var/www/ironrisk/backend/api/preferences.py")

sftp.close()

print("Restarting ironrisk service...")
stdin, stdout, stderr = ssh.exec_command("systemctl restart ironrisk")
print("STDOUT:", stdout.read().decode())
print("STDERR:", stderr.read().decode())

ssh.close()
print("Deployment to Hetzner complete.")
