"""One-off script to reset a user's password using raw bcrypt."""
import bcrypt
from models.database import SessionLocal
from models.user import User

NEW_PASSWORD = "ironrisk2026"
TARGET_EMAIL = "ivanpavonmaiz@gmail.com"

# Hash with raw bcrypt (bypasses passlib entirely)
hashed = bcrypt.hashpw(NEW_PASSWORD.encode("utf-8"), bcrypt.gensalt())
print(f"Generated hash: {hashed.decode()}")

# Verify it works before saving
assert bcrypt.checkpw(NEW_PASSWORD.encode("utf-8"), hashed), "Hash verification failed!"
print("Self-check OK: hash matches password")

# Save to DB
db = SessionLocal()
user = db.query(User).filter(User.email == TARGET_EMAIL).first()
if user:
    user.hashed_password = hashed.decode("utf-8")
    db.commit()
    print(f"Password reset OK for {user.email}")
else:
    print(f"User {TARGET_EMAIL} not found!")
db.close()
