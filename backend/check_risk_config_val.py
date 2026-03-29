import json
from sqlalchemy.orm import Session
from models.database import SessionLocal
from models.strategy import Strategy

db = SessionLocal()
strats = db.query(Strategy).all()
for s in strats:
    if s.risk_config:
        print(f"Strategy {s.name}: risk_config = {json.dumps(s.risk_config, indent=2)}")
        break
db.close()
