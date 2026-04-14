import paramiko
import time
import os
import secrets

HOST = '62.238.19.114'
USER = 'root'
PASSWORD = 'IronRisk_Production_2026!'
DOMAIN = '62-238-19-114.nip.io'
DB_PASSWORD = secrets.token_urlsafe(16)

def run_cmd(ssh, cmd, ignore_err=False):
    print(f"[SERVER] Running: {cmd}")
    stdin, stdout, stderr = ssh.exec_command(cmd)
    exit_status = stdout.channel.recv_exit_status()
    out = stdout.read().decode().strip()
    err = stderr.read().decode().strip()
    if exit_status != 0 and not ignore_err:
        print(f"ERROR running {cmd}\nSTDOUT: {out}\nSTDERR: {err}")
        raise Exception("Command failed")
    return out

def deploy():
    print(f"Connecting to {HOST}...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        ssh.connect(HOST, username=USER, password=PASSWORD)
    except Exception as e:
        print(f"Failed to connect: {e}")
        return

    print("\n--- 1. SYSTEM UPDATES & PACKAGES ---")
    run_cmd(ssh, "apt-get update")
    run_cmd(ssh, "DEBIAN_FRONTEND=noninteractive apt-get upgrade -yq")
    run_cmd(ssh, "DEBIAN_FRONTEND=noninteractive apt-get install -yq python3-venv python3-pip python3-dev build-essential postgresql postgresql-contrib nginx certbot python3-certbot-nginx rsync")

    print("\n--- 2. DATABASE SETUP ---")
    run_cmd(ssh, "sudo -u postgres psql -c \"DROP DATABASE IF EXISTS ironrisk;\"", ignore_err=True)
    run_cmd(ssh, "sudo -u postgres psql -c \"DROP USER IF EXISTS ironrisk_user;\"", ignore_err=True)
    run_cmd(ssh, f"sudo -u postgres psql -c \"CREATE USER ironrisk_user WITH PASSWORD '{DB_PASSWORD}';\"")
    run_cmd(ssh, "sudo -u postgres psql -c \"CREATE DATABASE ironrisk OWNER ironrisk_user;\"")

    print("\n--- 3. CREATING DIRS & UPLOADING CODE ---")
    run_cmd(ssh, "mkdir -p /var/www/ironrisk/backend")
    run_cmd(ssh, "mkdir -p /var/www/ironrisk/db_restore")
    
    # We will upload files using SFTP
    sftp = ssh.open_sftp()
    
    local_backend_dir = os.path.join(os.path.dirname(__file__), 'backend')
    print("Uploading backend files... (this may take a minute)")
    def upload_dir(local_path, remote_path):
        for item in os.listdir(local_path):
            if item in ['__pycache__', 'venv', '.env', '.pytest_cache', 'tests']:
                continue
            item_local = os.path.join(local_path, item)
            item_remote = f"{remote_path}/{item}"
            if os.path.isfile(item_local):
                sftp.put(item_local, item_remote)
            elif os.path.isdir(item_local):
                try:
                    sftp.mkdir(item_remote)
                except IOError:
                    pass
                upload_dir(item_local, item_remote)

    upload_dir(local_backend_dir, "/var/www/ironrisk/backend")
    
    print("Uploading Database Backup (JSON format)...")
    local_db_backup = os.path.join(os.path.dirname(__file__), 'db_backup')
    try:
        sftp.mkdir("/var/www/ironrisk/db_restore")
    except: pass
    upload_dir(local_db_backup, "/var/www/ironrisk/db_restore")
    
    sftp.close()

    print("\n--- 4. VIRTUAL ENV & DEPENDENCIES ---")
    run_cmd(ssh, "cd /var/www/ironrisk/backend && python3 -m venv venv")
    run_cmd(ssh, "cd /var/www/ironrisk/backend && ./venv/bin/pip install --upgrade pip")
    run_cmd(ssh, "cd /var/www/ironrisk/backend && ./venv/bin/pip install -r requirements.txt psycopg2-binary")
    
    # Create secure .env file
    env_content = f"""DATABASE_URL=postgresql://ironrisk_user:{DB_PASSWORD}@localhost:5432/ironrisk
JWT_SECRET=super-secret-key-123
FRONTEND_URL=https://{DOMAIN}
"""
    run_cmd(ssh, f"cat << 'EOF' > /var/www/ironrisk/backend/.env\n{env_content}EOF")

    run_cmd(ssh, "echo 'PYTHONPATH=/var/www/ironrisk/backend' >> /var/www/ironrisk/backend/.env")

    print("\n--- 5. RESTORING DATABASE FROM JSON ---")
    # For DB restore we will generate tables using Alembic, then insert the JSON files
    run_cmd(ssh, "cd /var/www/ironrisk/backend && ./venv/bin/alembic upgrade head")
    
    db_importer = f"""import json, os, ast
from sqlalchemy import create_engine, MetaData, insert, text

DB_URL = "postgresql://ironrisk_user:{DB_PASSWORD}@localhost:5432/ironrisk"
BACKUP_DIR = "/var/www/ironrisk/db_restore"

engine = create_engine(DB_URL)
meta = MetaData()
meta.reflect(bind=engine)

order = ['users', 'user_preferences', 'user_themes', 'trading_accounts', 
         'portfolios', 'strategies', 'real_trades', 'strategy_links', 
         'system_settings', 'user_alert_configs', 'user_alert_history', 'waitlist_leads']

with engine.begin() as conn:
    for table_name in order:
        json_file = os.path.join(BACKUP_DIR, f"{{table_name}}.json")
        if not os.path.exists(json_file): continue
        with open(json_file, 'r', encoding='utf-8') as f:
            data = json.load(f)
            
        if not data: continue
        table = meta.tables[table_name]
        
        print(f"Restoring {{table_name}} ({{len(data)}} rows)...")
        # Ensure we don't duplicate
        conn.execute(table.delete())
        
        # Batch insert
        try:
            conn.execute(insert(table), data)
        except Exception as e:
            print(f"Failed bulk insert, trying row by row: {{e}}")
            for row in data:
                try:
                    conn.execute(insert(table).values(**row))
                except Exception as ex:
                    print(f"Failed row: {{ex}}")
                    
    # Fix sequences for auto-incrementing ID fields
    for table_name in order:
        try:
            conn.execute(text(f"SELECT setval('{{table_name}}_id_seq', COALESCE((SELECT MAX(id)+1 FROM {{table_name}}), 1), false);"))
        except Exception:
            pass

print("Restore finished.")
"""
    run_cmd(ssh, f"cat << 'EOF' > /var/www/ironrisk/backend/restore.py\n{db_importer}EOF")
    run_cmd(ssh, "cd /var/www/ironrisk/backend && ./venv/bin/python restore.py", ignore_err=True)

    print("\n--- 6. SYSTEMD SERVICE ---")
    service_file = """[Unit]
Description=IronRisk Backend (Uvicorn)
After=network.target

[Service]
User=root
Group=www-data
WorkingDirectory=/var/www/ironrisk/backend
Environment="PATH=/var/www/ironrisk/backend/venv/bin"
ExecStart=/var/www/ironrisk/backend/venv/bin/uvicorn main:app --host 127.0.0.1 --port 8000

Restart=always

[Install]
WantedBy=multi-user.target
"""
    run_cmd(ssh, f"cat << 'EOF' > /etc/systemd/system/ironrisk.service\n{service_file}EOF")
    run_cmd(ssh, "systemctl daemon-reload")
    run_cmd(ssh, "systemctl start ironrisk")
    run_cmd(ssh, "systemctl enable ironrisk")

    print("\n--- 7. NGINX & SSL ---")
    nginx_conf = f"""server {{
    listen 80;
    server_name {DOMAIN};

    location / {{
        proxy_pass http://127.0.0.1:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        
        # Fix for CORS
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }}
}}
"""
    run_cmd(ssh, f"cat << 'EOF' > /etc/nginx/sites-available/ironrisk\n{nginx_conf}EOF")
    run_cmd(ssh, "ln -sf /etc/nginx/sites-available/ironrisk /etc/nginx/sites-enabled/")
    run_cmd(ssh, "rm -f /etc/nginx/sites-enabled/default")
    run_cmd(ssh, "systemctl restart nginx")
    
    print("Requesting SSL Certificate (might take a moment)...")
    run_cmd(ssh, f"certbot --nginx -d {DOMAIN} --non-interactive --agree-tos -m ivanpavonmaiz@gmail.com --redirect", ignore_err=True)

    ssh.close()
    print(f"\n✅ DEPLOYMENT COMPLETE!")
    print(f"Backend API URL: https://{DOMAIN}")

if __name__ == '__main__':
    deploy()
