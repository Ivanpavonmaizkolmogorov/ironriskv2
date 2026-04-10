"""
One-shot migration: SQLite (local) → Railway PostgreSQL
Handles SQLite integer booleans → PostgreSQL native booleans
"""
import os
from sqlalchemy import create_engine, text, inspect

SQLITE_URL = "sqlite:///" + os.path.join(os.path.dirname(__file__), "ironrisk.db")
PG_URL = "postgresql://postgres:awuEZWcUpKuKcFHgykshFstwceJFgjAN@mainline.proxy.rlwy.net:19378/railway"

TABLES_ORDER = [
    "users",
    "trading_accounts",
    "strategies",
    "portfolios",
    "real_trades",
    "user_alert_configs",
    "user_alert_history",
    "user_preferences",
    "user_themes",
    "feature_flags",
    "orphan_magics",
]

def get_boolean_columns(pg_engine, table_name):
    """Find which columns are BOOLEAN in the PostgreSQL schema."""
    inspector = inspect(pg_engine)
    bool_cols = set()
    try:
        for col in inspector.get_columns(table_name):
            if str(col["type"]).upper() == "BOOLEAN":
                bool_cols.add(col["name"])
    except Exception:
        pass
    return bool_cols

def fix_row(row_dict, bool_cols):
    """Convert SQLite integer booleans (0/1) to Python bool for PostgreSQL."""
    for col in bool_cols:
        if col in row_dict and row_dict[col] is not None:
            row_dict[col] = bool(row_dict[col])
    return row_dict

def migrate():
    sqlite_engine = create_engine(SQLITE_URL)
    pg_engine = create_engine(PG_URL)

    sqlite_tables = inspect(sqlite_engine).get_table_names()
    print(f"📦 SQLite tables: {sqlite_tables}")
    print(f"🎯 Target: Railway PostgreSQL")
    print("=" * 60)

    for table_name in TABLES_ORDER:
        if table_name not in sqlite_tables:
            print(f"⏭️  {table_name}: not in SQLite, skipping")
            continue

        # Read from SQLite
        with sqlite_engine.connect() as sc:
            rows = sc.execute(text(f"SELECT * FROM {table_name}")).fetchall()
            if not rows:
                print(f"⏭️  {table_name}: empty")
                continue
            col_names = list(sc.execute(text(f"SELECT * FROM {table_name} LIMIT 1")).keys())

        # Detect boolean columns in PG
        bool_cols = get_boolean_columns(pg_engine, table_name)

        # Build INSERT
        col_list = ", ".join([f'"{c}"' for c in col_names])
        placeholders = ", ".join([f":{c}" for c in col_names])
        insert_sql = f'INSERT INTO "{table_name}" ({col_list}) VALUES ({placeholders})'

        # Convert rows
        batch = [fix_row(dict(zip(col_names, row)), bool_cols) for row in rows]

        with pg_engine.begin() as pg_conn:
            pg_conn.execute(text(f"DELETE FROM \"{table_name}\""))
            success = 0
            errors = 0
            for row_dict in batch:
                try:
                    pg_conn.execute(text(insert_sql), row_dict)
                    success += 1
                except Exception as e:
                    errors += 1
                    if errors <= 3:
                        print(f"   ⚠️ Row error: {str(e)[:120]}")
            
            if errors == 0:
                print(f"✅ {table_name}: {success} rows migrated")
            else:
                print(f"⚠️  {table_name}: {success} OK, {errors} errors")

    # Reset sequences
    print("\n🔄 Resetting sequences...")
    with pg_engine.begin() as pg_conn:
        for table_name in TABLES_ORDER:
            try:
                pk = inspect(pg_engine).get_pk_constraint(table_name).get("constrained_columns", [])
                if pk and pk[0] == "id":
                    pg_conn.execute(text(
                        f"SELECT setval(pg_get_serial_sequence('{table_name}', 'id'), "
                        f"COALESCE((SELECT MAX(id) FROM \"{table_name}\"), 0) + 1, false)"
                    ))
                    print(f"  🔁 {table_name}.id → reset")
            except Exception:
                pass

    print("\n" + "=" * 60)
    print("🚀 ¡Migración completada!")

if __name__ == "__main__":
    migrate()
