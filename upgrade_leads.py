
import uuid
import secrets
from datetime import datetime, timezone
from models.database import SessionLocal
from models.user import User
from models.waitlist import WaitlistLead
from models.trading_account import TradingAccount
from services.auth_service import hash_password

db = SessionLocal()
leads = db.query(WaitlistLead).filter(
    (WaitlistLead.password_hash == None) | (WaitlistLead.password_hash == '')
).all()

count = 0
for l in leads:
    existing = db.query(User).filter(User.email == l.email).first()
    raw_pwd = secrets.token_urlsafe(32)
    l.password_hash = hash_password(raw_pwd)
    l.approved_at = datetime.now(timezone.utc)
    
    if not existing:
        new_user = User(
            id=str(uuid.uuid4()),
            email=l.email,
            hashed_password=l.password_hash,
            email_verified=True,
            is_admin=False,
        )
        db.add(new_user)
        ws_name = 'Mi Primer Workspace' if l.locale == 'es' else 'My First Workspace'
        default_ws = TradingAccount(
            id=str(uuid.uuid4()),
            user_id=new_user.id,
            name=ws_name,
            account_number='',
            broker=''
        )
        db.add(default_ws)
        print(f'Created account and workspace for: {l.email}')
        count += 1
    else:
        print(f'User already exists: {l.email}, just marked approved.')
        
db.commit()
print(f'Successfully upgraded {count} leads to full accounts.')
