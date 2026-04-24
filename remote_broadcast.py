import paramiko

ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect('62.238.19.114', username='root', password='IronRisk_Production_2026!')

script_content = """import sys
import os
import time

sys.path.insert(0, ".")

from models.database import SessionLocal
from models.waitlist import WaitlistLead
from services.email_service import EmailService

def main():
    db = SessionLocal()
    try:
        leads = db.query(WaitlistLead).all()
        print(f"[*] Found {len(leads)} leads to reactivate.")
        
        if len(leads) == 0:
            print("[-] No leads to process.")
            return

        svc = EmailService()
        if not svc.is_configured():
            print("[!] Email service is not configured. Aborting.")
            return

        success = 0
        failed = 0
        
        for lead in leads:
            print(f"[*] Sending beta reactivation to {lead.email} (locale: {lead.locale})...")
            try:
                time.sleep(1)
                sent = svc.send_beta_reactivation(recipient_email=lead.email, locale=lead.locale)
                if sent:
                    success += 1
                else:
                    failed += 1
            except Exception as e:
                print(f"[!] Error sending to {lead.email}: {e}")
                failed += 1
                
        # Send explicitly to admin to verify completion
        print("\\n[*] Sending admin confirmation email to ivanpavonmaiz@gmail.com...")
        try:
            svc.send_beta_reactivation(recipient_email="ivanpavonmaiz@gmail.com", locale="es")
            print("[+] Admin copy sent successfully.")
        except Exception as e:
            print(f"[!] Failed to send admin copy: {e}")

        print(f"\\n[*] Broadcast complete! Success: {success}, Failed: {failed}")
    finally:
        db.close()

if __name__ == "__main__":
    main()
"""

sftp = ssh.open_sftp()
with sftp.file('/var/www/ironrisk/backend/scripts/broadcast_beta.py', 'w') as f:
    f.write(script_content)
sftp.close()

cmd = "cd /var/www/ironrisk/backend && /var/www/ironrisk/backend/venv/bin/python scripts/broadcast_beta.py"
_, stdout, stderr = ssh.exec_command(cmd)

print("STDOUT:", stdout.read().decode('utf-8'))
print("STDERR:", stderr.read().decode('utf-8'))
ssh.close()
