"""Migration script to add 'theme' column to trading_accounts in SQLite."""

import sqlite3
import os

db_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "ironrisk.db")

def migrate():
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    try:
        cursor.execute("ALTER TABLE trading_accounts ADD COLUMN theme VARCHAR(50) NULL;")
        conn.commit()
        print("Successfully added 'theme' column to trading_accounts.")
    except sqlite3.OperationalError as e:
        if "duplicate column name" in str(e).lower():
            print("Column 'theme' already exists.")
        else:
            print(f"Error: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
