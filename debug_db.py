"""Debug script to list recent trading accounts and their tokens."""
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

DATABASE_URL = "postgresql://ironrisk_user:ouu7-iHet06AxyAMZvNw-g@localhost:5432/ironrisk"

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(bind=engine)
db = SessionLocal()

print("Recent Trading Accounts:")
accounts = db.execute("SELECT id, name, user_id, api_token, account_number, is_active FROM trading_accounts ORDER BY created_at DESC LIMIT 5").fetchall()
for acc in accounts:
    print(f"ID: {acc[0]}\nName: {acc[1]}\nToken: {acc[3][:10]}...{acc[3][-5:]}\nAccNumber: '{acc[4]}'\nActive: {acc[5]}\n")

db.close()
