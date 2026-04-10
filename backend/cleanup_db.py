import sqlite3
import collections

conn = sqlite3.connect('ironrisk.db')
conn.row_factory = sqlite3.Row
c = conn.cursor()

# Get all configs
c.execute("SELECT id, target_id, metric_key FROM user_alert_configs")
rows = c.fetchall()

groups = collections.defaultdict(list)
for r in rows:
    groups[(r['target_id'], r['metric_key'])].append(r['id'])

for key, ids in groups.items():
    if len(ids) > 1:
        # Keep the last one, delete the rest
        ids_to_delete = ids[:-1]
        for idx in ids_to_delete:
            print(f"Deleting duplicate config: {idx} for {key}")
            c.execute("DELETE FROM user_alert_configs WHERE id=?", (idx,))

conn.commit()
print("Cleanup complete.")
