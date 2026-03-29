import json
from sqlalchemy.orm import Session
from models.database import SessionLocal
from models.strategy import Strategy

db = SessionLocal()
strats = db.query(Strategy).all()
for s in strats:
    if s.risk_config:
        print(f"Strategy {s.name}: risk_config keys = {list(s.risk_config.keys())}")
        print(f"  metrics_snapshot keys = {list(s.metrics_snapshot.keys()) if s.metrics_snapshot else None}")
        break  # Just look at the first one
db.close()
