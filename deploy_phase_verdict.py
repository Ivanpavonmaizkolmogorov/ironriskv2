"""Deploy the 3-phase verdict system to Hetzner production."""
import paramiko
import os

HOST = "62.238.19.114"
USER = "root"
PASS = "IronRisk_Production_2026!"
REMOTE_BASE = "/var/www/ironrisk/backend"

LOCAL_BASE = os.path.join(os.path.dirname(__file__), "backend")

FILES = [
    ("services/risk_info_engine.py", f"{REMOTE_BASE}/services/risk_info_engine.py"),
]

def main():
    print("[1/3] Connecting to Hetzner...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PASS, timeout=15)
    sftp = ssh.open_sftp()
    print("  Connected OK")

    # Ensure remote dirs exist
    ssh.exec_command(f"mkdir -p {REMOTE_BASE}/services")
    import time; time.sleep(1)

    print("[2/3] Uploading files...")
    for local_rel, remote_path in FILES:
        local_path = os.path.join(LOCAL_BASE, local_rel)
        print(f"  {local_rel} -> {remote_path}")
        sftp.put(local_path, remote_path)
    print("  Upload complete")

    print("[3/3] Restarting ironrisk.service...")
    stdin, stdout, stderr = ssh.exec_command("systemctl restart ironrisk.service && systemctl is-active ironrisk.service")
    result = stdout.read().decode().strip()
    err = stderr.read().decode().strip()
    if err:
        print(f"  stderr: {err}")
    print(f"  Service status: {result}")

    sftp.close()
    ssh.close()
    print("\nDone! 3-phase verdict system deployed to production.")

if __name__ == "__main__":
    main()
