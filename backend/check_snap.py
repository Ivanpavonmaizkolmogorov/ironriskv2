import sys, json
sys.path.insert(0, ".")
from models import SessionLocal, Strategy

db = SessionLocal()
s = db.query(Strategy).filter(Strategy.name.like("%19_Xausdjpy%")).first()
if not s:
    print("Not found")
else:
    ms = s.metrics_snapshot or {}
    for k in sorted(ms.keys()):
        v = ms[k]
        if isinstance(v, dict):
            max_keys = {k2: v2 for k2, v2 in v.items() if "max" in k2.lower()}
            print(f"{k}: {max_keys}")
