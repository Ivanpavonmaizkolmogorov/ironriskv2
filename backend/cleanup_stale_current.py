"""Clean up stale risk_config entries: remove 'current' values from strategies
that have no 'last_updated' timestamp (i.e., never received a real heartbeat)."""

import sys, os, json
sys.path.insert(0, os.path.dirname(__file__))

from models.database import SessionLocal
from models.strategy import Strategy

def cleanup():
    db = SessionLocal()
    try:
        strategies = db.query(Strategy).all()
        cleaned = 0
        for s in strategies:
            rc = s.risk_config
            if not rc or not isinstance(rc, dict):
                continue
            # If there's no last_updated, any 'current' values are stale
            if "last_updated" not in rc:
                changed = False
                for key, cfg in rc.items():
                    if isinstance(cfg, dict) and "current" in cfg:
                        del cfg["current"]
                        changed = True
                if changed:
                    from sqlalchemy.orm.attributes import flag_modified
                    flag_modified(s, "risk_config")
                    cleaned += 1
                    print(f"  Cleaned stale current from: {s.name}")
        db.commit()
        print(f"\nDone. Cleaned {cleaned} strategies.")
    finally:
        db.close()

if __name__ == "__main__":
    cleanup()
