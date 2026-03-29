"""Migration: Rename 'consec_losses' → 'consecutive_losses' in distribution_fit JSON.

Ensures the metric key stored in the DB matches the unified OOP metric name.
"""

import json
import sqlite3

DB_PATH = "ironrisk.db"

conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

cursor.execute("SELECT id, distribution_fit FROM strategies WHERE distribution_fit IS NOT NULL")
rows = cursor.fetchall()

updated = 0
for row_id, df_raw in rows:
    if not df_raw:
        continue
    try:
        df = json.loads(df_raw) if isinstance(df_raw, str) else df_raw
    except (json.JSONDecodeError, TypeError):
        continue

    if "consec_losses" in df:
        df["consecutive_losses"] = df.pop("consec_losses")
        cursor.execute(
            "UPDATE strategies SET distribution_fit = ? WHERE id = ?",
            (json.dumps(df), row_id),
        )
        updated += 1

conn.commit()
conn.close()

print(f"Migration complete: {updated} strategies updated (consec_losses → consecutive_losses)")
