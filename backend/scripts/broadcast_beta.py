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
                # Add slight delay to avoid rate limits
                time.sleep(1)
                
                # To prevent accidental spam, we will only log it if we aren't completely sure.
                # But since the user gave the "OK" to resurrect the leads, we fire it.
                sent = svc.send_beta_reactivation(recipient_email=lead.email, locale=lead.locale)
                if sent:
                    success += 1
                else:
                    failed += 1
            except Exception as e:
                print(f"[!] Error sending to {lead.email}: {e}")
                failed += 1
                
        print(f"\n[*] Broadcast complete! Success: {success}, Failed: {failed}")
    finally:
        db.close()

if __name__ == "__main__":
    main()
