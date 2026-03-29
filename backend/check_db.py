import sqlite3, json
conn = sqlite3.connect('ironrisk.db')
cursor = conn.cursor()
cursor.execute('SELECT id, name, distribution_fit FROM strategies ORDER BY created_at DESC LIMIT 5')
rows = cursor.fetchall()
for row in rows:
    sid, name, df = row
    print(f"\n=== {name} ===")
    print(f"    id: {sid[:12]}...")
    if df and df != '{}' and df != 'null':
        try:
            data = json.loads(df) if isinstance(df, str) else df
            if isinstance(data, dict) and data:
                for metric, fit in data.items():
                    if isinstance(fit, dict):
                        dname = fit.get('distribution_name', '?')
                        pval = fit.get('p_value', 0)
                        passed = fit.get('passed', False)
                        tag = 'PASSED' if passed else 'empirical'
                        print(f"    {metric:25s} -> {dname:15s} p={pval:.4f} {tag}")
                    else:
                        print(f"    {metric}: {fit}")
            else:
                print("    distribution_fit: EMPTY dict")
        except Exception as e:
            print(f"    ERROR parsing: {e}")
            print(f"    raw value: {df[:100]}")
    else:
        print("    distribution_fit: NULL or empty")
conn.close()
