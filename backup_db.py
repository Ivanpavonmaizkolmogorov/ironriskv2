"""Export Railway PostgreSQL database to a local SQL dump file."""
import subprocess, sys

# Install psycopg2 if missing
subprocess.run([sys.executable, "-m", "pip", "install", "psycopg2-binary", "-q"], check=True)

import psycopg2, json, os
from datetime import datetime, date
from decimal import Decimal

DB_URL = "postgresql://postgres:awuEZWcUpKuKcFHgykshFstwceJFgjAN@mainline.proxy.rlwy.net:19378/railway"
OUT_DIR = os.path.join(os.path.dirname(__file__), "db_backup")
os.makedirs(OUT_DIR, exist_ok=True)

def default_serializer(obj):
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    if isinstance(obj, Decimal):
        return float(obj)
    if isinstance(obj, bytes):
        return obj.hex()
    return str(obj)

conn = psycopg2.connect(DB_URL)
cur = conn.cursor()

# Get all tables
cur.execute("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name")
tables = [r[0] for r in cur.fetchall()]
print(f"Found {len(tables)} tables: {tables}")

# Also dump the schema (DDL)
cur.execute("""
    SELECT table_name, column_name, data_type, is_nullable, column_default
    FROM information_schema.columns 
    WHERE table_schema='public' 
    ORDER BY table_name, ordinal_position
""")
schema = {}
for row in cur.fetchall():
    tbl = row[0]
    if tbl not in schema:
        schema[tbl] = []
    schema[tbl].append({
        "column": row[1],
        "type": row[2],
        "nullable": row[3],
        "default": row[4]
    })

with open(os.path.join(OUT_DIR, "_schema.json"), "w", encoding="utf-8") as f:
    json.dump(schema, f, indent=2, default=default_serializer)
print("Schema saved to _schema.json")

# Export each table to JSON
total_rows = 0
for table in tables:
    try:
        cur.execute(f'SELECT * FROM "{table}"')
        columns = [desc[0] for desc in cur.description]
        rows = cur.fetchall()
        
        data = []
        for row in rows:
            data.append(dict(zip(columns, row)))
        
        fname = os.path.join(OUT_DIR, f"{table}.json")
        with open(fname, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, default=default_serializer, ensure_ascii=False)
        
        print(f"  {table}: {len(rows)} rows")
        total_rows += len(rows)
    except Exception as e:
        print(f"  {table}: ERROR - {e}")
        conn.rollback()

cur.close()
conn.close()

print(f"\n✅ Backup complete: {total_rows} total rows across {len(tables)} tables")
print(f"   Saved to: {OUT_DIR}")
