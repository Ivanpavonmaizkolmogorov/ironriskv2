"""
One-off script to broadcast the beta reactivation email to all pending WaitlistLeads.
"""
import sys
import os
import time

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.database import SessionLocal
from models.waitlist import WaitlistLead
from services.email_service import EmailService

def main():
    db = SessionLocal()
    try:
        leads = db.query(WaitlistLead).filter(WaitlistLead.approved_at == None).all()
        print(f"[*] Found {len(leads)} pending leads to reactivate.")
        
        if len(leads) == 0:
            print("[-] No pending leads to process.")
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
        print("\n[*] Sending admin confirmation email to ivanpavonmaiz@gmail.com...")
        try:
            svc.send_beta_reactivation(recipient_email="ivanpavonmaiz@gmail.com", locale="es")
            print("[+] Admin copy sent successfully.")
        except Exception as e:
            print(f"[!] Failed to send admin copy: {e}")

        print(f"\n[*] Broadcast complete! Success: {success}, Failed: {failed}")
    finally:
        db.close()

if __name__ == "__main__":
    main()
