import paramiko
import os

HOST = "62.238.19.114"
USER = "root"
PASS = "IronRisk_Production_2026!"
REMOTE_BASE = "/var/www/ironrisk/backend"

LOCAL_FILE = os.path.join(os.path.dirname(__file__), "clear_remote.py")
REMOTE_FILE = f"{REMOTE_BASE}/clear_remote.py"

def main():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASS, timeout=15)
    
    sftp = ssh.open_sftp()
    sftp.put(LOCAL_FILE, REMOTE_FILE)
    sftp.close()
    
    cmd = f"cd {REMOTE_BASE} && source venv/bin/activate && python clear_remote.py"
    stdin, stdout, stderr = ssh.exec_command(cmd)
    result = stdout.read().decode().strip()
    err = stderr.read().decode().strip()
    
    print(f"Stdout:\n{result}")
    if err:
        print(f"Stderr:\n{err}")
    
    ssh.close()

if __name__ == "__main__":
    main()
