import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('62.238.19.114', username='root', password='IronRisk_Production_2026!')

# Force kill and restart
stdin, stdout, stderr = ssh.exec_command('systemctl stop ironrisk && sleep 1 && systemctl start ironrisk && sleep 2 && systemctl is-active ironrisk')
status = stdout.read().decode().strip()
print(f'Service: {status}')

# Verify the actual API response for invite text
stdin2, stdout2, stderr2 = ssh.exec_command('/var/www/ironrisk/backend/venv/bin/python3 -c "import sys; sys.path.insert(0, \'/var/www/ironrisk/backend\'); from config.tutorials import get_tutorial_url; print(get_tutorial_url(\'es\'))"')
url = stdout2.read().decode().strip()
print(f'Tutorial ES URL: {url}')

ssh.close()
