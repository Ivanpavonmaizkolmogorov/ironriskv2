import sqlite3, json

db = sqlite3.connect("ironrisk.db")
cur = db.cursor()
# Check the active EA strategy AND another random one
for name_pattern in ['%4_WS30%v3BKSell%0.8%', '%10_BTC%', '%1_WS30%0.7%']:
    cur.execute(f"SELECT name, risk_config FROM strategies WHERE name LIKE '{name_pattern}';")
    rows = cur.fetchall()
    for r in rows:
        try:
            cfg = json.loads(r[1])
            has_ts = "last_updated" in cfg
            dd_cur = cfg.get("max_drawdown", {}).get("current", "MISSING")
            print(f"{'✅' if has_ts else '❌'} {r[0][:55]:55s} | DD={dd_cur} | ts={cfg.get('last_updated', 'NONE')[:19] if has_ts else 'NONE'}")
        except:
            print(f"❌ {r[0]} | ERROR")
