import paramiko

HOST = '62.238.19.114'
USER = 'root'
PASSWORD = 'IronRisk_Production_2026!'

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(HOST, username=USER, password=PASSWORD)

stdin, stdout, stderr = ssh.exec_command("PGPASSWORD='ouu7-iHet06AxyAMZvNw-g' psql -U ironrisk_user -d ironrisk -h localhost -c 'SELECT id, created_at, name, api_token FROM trading_accounts ORDER BY created_at DESC LIMIT 10;'")
print(stdout.read().decode('utf-8'))
print(stderr.read().decode('utf-8'))
ssh.close()
