import paramiko
import time

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('62.238.19.114', username='root', password='IronRisk_Production_2026!')

# 1. Install certbot if not present
print("[1] Installing certbot...")
stdin, stdout, stderr = ssh.exec_command('apt-get install -y certbot python3-certbot-nginx 2>&1 | tail -5')
print(stdout.read().decode())

# 2. Update Nginx config to add api.ironrisk.pro as server_name
print("[2] Updating Nginx config...")
nginx_config = """
server {
    listen 80;
    server_name api.ironrisk.pro 62-238-19-114.nip.io;

    location / {
        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 120s;
    }
}
"""
# Write the nginx config
sftp = ssh.open_sftp()
with sftp.open('/etc/nginx/sites-available/ironrisk', 'w') as f:
    f.write(nginx_config)
sftp.close()

# Enable site
ssh.exec_command('ln -sf /etc/nginx/sites-available/ironrisk /etc/nginx/sites-enabled/ironrisk')
ssh.exec_command('rm -f /etc/nginx/sites-enabled/default')

# Test nginx config
stdin, stdout, stderr = ssh.exec_command('nginx -t 2>&1')
nginx_test = stdout.read().decode() + stderr.read().decode()
print(f"Nginx test: {nginx_test}")

# Reload nginx
ssh.exec_command('systemctl reload nginx')
time.sleep(2)

# 3. Get SSL certificate
print("[3] Getting SSL certificate for api.ironrisk.pro...")
stdin, stdout, stderr = ssh.exec_command(
    'certbot --nginx -d api.ironrisk.pro --non-interactive --agree-tos -m ivanpavonmaiz@gmail.com 2>&1'
)
cert_output = stdout.read().decode()
print(cert_output[-500:])  # Last 500 chars

# Verify
print("\n[4] Verifying...")
stdin, stdout, stderr = ssh.exec_command('nginx -t 2>&1')
print("Nginx:", (stdout.read().decode() + stderr.read().decode()).strip())

stdin, stdout, stderr = ssh.exec_command('systemctl is-active ironrisk')
print("IronRisk:", stdout.read().decode().strip())

ssh.close()
print("\nDone!")
