
import uuid
import secrets
from models.database import SessionLocal
from models.user import User
from models.trading_account import TradingAccount
from services.auth_service import hash_password

db = SessionLocal()
email = 'ironrisk.shield@gmail.com'

# Ensure it doesn't already exist
existing = db.query(User).filter(User.email == email).first()
if existing:
    print(f'User {email} already exists! Replacing password hash...')
    raw_pwd = secrets.token_urlsafe(32)
    existing.hashed_password = hash_password(raw_pwd)
    db.commit()
    print('Password randomized so you can test recovery.')
else:
    # Create user
    raw_pwd = secrets.token_urlsafe(32)
    new_user = User(
        id=str(uuid.uuid4()),
        email=email,
        hashed_password=hash_password(raw_pwd),
        email_verified=True,
        is_admin=True,
    )
    db.add(new_user)
    
    # Create workspace
    default_ws = TradingAccount(
        id=str(uuid.uuid4()),
        user_id=new_user.id,
        name='Mi Primer Workspace',
        account_number='',
        broker=''
    )
    db.add(default_ws)
    db.commit()
    print(f'Done! Created {email} account.')
