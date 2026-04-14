"""
IronRisk — One-command backend deploy to Hetzner.
Usage: python deploy.py
Same as a 'git push' to Railway, but for our VPS.
"""
import paramiko
import os
import sys
import time

HOST = '62.238.19.114'
USER = 'root'
PASSWORD = 'IronRisk_Production_2026!'
REMOTE_DIR = '/var/www/ironrisk/backend'

EXCLUDE = {'__pycache__', 'venv', '.env', '.pytest_cache', 'tests', '.git', 'node_modules'}

def upload_dir(sftp, local_path, remote_path):
    """Recursively upload a directory, skipping excluded folders."""
    count = 0
    for item in os.listdir(local_path):
        if item in EXCLUDE:
            continue
        item_local = os.path.join(local_path, item)
        item_remote = f"{remote_path}/{item}"
        if os.path.isfile(item_local):
            sftp.put(item_local, item_remote)
            count += 1
        elif os.path.isdir(item_local):
            try:
                sftp.mkdir(item_remote)
            except IOError:
                pass
            count += upload_dir(sftp, item_local, item_remote)
    return count

def deploy():
    print("🚀 Conectando a Hetzner...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASSWORD)

    print("📦 Subiendo archivos del backend...")
    sftp = ssh.open_sftp()
    local_backend = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'backend')
    n = upload_dir(sftp, local_backend, REMOTE_DIR)
    sftp.close()
    print(f"   {n} archivos subidos")

    print("🔄 Reiniciando servicio...")
    stdin, stdout, stderr = ssh.exec_command('systemctl restart ironrisk')
    stdout.channel.recv_exit_status()

    time.sleep(2)
    stdin, stdout, stderr = ssh.exec_command('systemctl is-active ironrisk')
    status = stdout.read().decode().strip()

    ssh.close()

    if status == 'active':
        print(f"✅ Deploy completo — servicio ACTIVO")
        print(f"   API: https://62-238-19-114.nip.io")
    else:
        print(f"❌ Error — servicio: {status}")
        sys.exit(1)

if __name__ == '__main__':
    deploy()
