import sys
import os
sys.path.insert(0, os.path.abspath("backend"))

from models.database import SessionLocal
from models.user import User
from services.email_service import EmailService

db = SessionLocal()
try:
    admin = db.query(User).filter_by(email="ivanpavonmaiz@gmail.com").first()
    svc = EmailService()
    svc.send_access_granted_email(admin.email, "https://example.com/login", "es")
    print("Done")
except Exception as e:
    import traceback
    traceback.print_exc()
finally:
    db.close()
