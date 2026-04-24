import sqlite3
import sys
import os

try:
    conn = sqlite3.connect('backend/ironrisk.db')
    cur = conn.cursor()
    cur.execute("SELECT locale FROM user_preferences JOIN users ON users.id=user_preferences.user_id WHERE users.email='ivanpavonmaiz@gmail.com'")
    result = cur.fetchall()
    print("Locale in DB:", result)
except Exception as e:
    print("Error:", e)
    sys.exit(1)
