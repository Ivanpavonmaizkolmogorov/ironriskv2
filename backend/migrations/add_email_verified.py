"""
Migration: Add email_verified column to users table.
Existing users get TRUE (they're already trusted), new registrations default to FALSE.
Supports both SQLite (dev) and PostgreSQL (prod).

Run: python backend/migrations/add_email_verified.py
"""

import sys
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from models.database import engine
from sqlalchemy import text, inspect

def migrate():
    inspector = inspect(engine)
    columns = [col["name"] for col in inspector.get_columns("users")]
    
    if "email_verified" in columns:
        print("[OK] Column 'email_verified' already exists. Nothing to do.")
        return

    dialect = engine.dialect.name
    
    with engine.connect() as conn:
        if dialect == "sqlite":
            conn.execute(text(
                "ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT 1 NOT NULL"
            ))
            conn.commit()
            print("[OK] [SQLite] Added 'email_verified' column (existing users = TRUE)")
        else:
            # PostgreSQL
            conn.execute(text(
                "ALTER TABLE users ADD COLUMN email_verified BOOLEAN DEFAULT TRUE NOT NULL"
            ))
            conn.commit()
            print("[OK] [PostgreSQL] Added 'email_verified' column (existing users = TRUE)")

            conn.execute(text(
                "ALTER TABLE users ALTER COLUMN email_verified SET DEFAULT FALSE"
            ))
            conn.commit()
            print("[OK] Default for new users set to FALSE")

if __name__ == "__main__":
    migrate()
