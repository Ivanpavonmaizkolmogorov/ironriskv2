"""Migration script to cleanly add 'user_themes' table to SQLite."""

import sqlite3
import os

db_path = os.path.join(os.path.dirname(os.path.dirname(__file__)), "ironrisk.db")

def migrate():
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    try:
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS user_themes (
                id VARCHAR NOT NULL,
                user_id VARCHAR NOT NULL,
                label VARCHAR(50) NOT NULL,
                mode VARCHAR(10) NOT NULL,
                colors JSON NOT NULL,
                PRIMARY KEY (id),
                FOREIGN KEY(user_id) REFERENCES users (id) ON DELETE CASCADE
            )
        ''')
        conn.commit()
        print("Successfully created 'user_themes' table.")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        conn.close()

if __name__ == "__main__":
    migrate()
