"""One-time script to fix production DB schema.
Run via: cd /var/www/ironrisk/backend && ./venv/bin/python fix_schema.py
"""
import sys
sys.path.insert(0, ".")

from models.database import engine
from sqlalchemy import text, inspect as sa_inspect

with engine.begin() as conn:
    # Add missing columns
    inspector = sa_inspect(engine)
    existing = [c["name"] for c in inspector.get_columns("user_preferences")]

    if "briefing_hour_utc" not in existing:
        conn.execute(text("ALTER TABLE user_preferences ADD COLUMN briefing_hour_utc INTEGER NOT NULL DEFAULT 6"))
        print("Added briefing_hour_utc")
    else:
        print("briefing_hour_utc already exists")

    if "last_briefing_date" not in existing:
        conn.execute(text("ALTER TABLE user_preferences ADD COLUMN last_briefing_date VARCHAR(10)"))
        print("Added last_briefing_date")
    else:
        print("last_briefing_date already exists")

    # Clear bayes caches
    try:
        conn.execute(text(
            "UPDATE strategies SET metrics_snapshot = (metrics_snapshot::jsonb - 'bayes_cache')::json "
            "WHERE metrics_snapshot IS NOT NULL "
            "AND metrics_snapshot::text LIKE '%bayes_cache%'"
        ))
        print("Cleared bayes caches")
    except Exception as e:
        print(f"Cache clear skipped: {e}")

    # Drop bt_discount column if it exists
    strat_cols = [c["name"] for c in inspector.get_columns("strategies")]
    if "bt_discount" in strat_cols:
        conn.execute(text("ALTER TABLE strategies DROP COLUMN bt_discount"))
        print("Dropped bt_discount column")
    else:
        print("bt_discount already dropped")

    # Stamp alembic to latest
    conn.execute(text("DELETE FROM alembic_version"))
    conn.execute(text("INSERT INTO alembic_version (version_num) VALUES ('g002_drop_bt_discount')"))
    print("Stamped alembic to g002_drop_bt_discount")

print("Done!")
