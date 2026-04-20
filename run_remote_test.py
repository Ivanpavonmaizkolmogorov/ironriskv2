import paramiko
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('62.238.19.114', username='root', password='IronRisk_Production_2026!')

sftp = ssh.open_sftp()
sftp.put(r"c:\Users\ivanp\Desktop\Symbols\Porfolios\ironriskv2\test_prod_alert.py", "/var/www/ironrisk/test_prod_alert.py")
sftp.close()

stdin, stdout, stderr = ssh.exec_command("/var/www/ironrisk/backend/venv/bin/python3 /var/www/ironrisk/test_prod_alert.py")
print("STDOUT:", stdout.read().decode('utf-8'))
print("STDERR:", stderr.read().decode('utf-8'))
