import json
from sqlalchemy.orm import Session
from models.database import SessionLocal
from models.strategy import Strategy

db = SessionLocal()
strats = db.query(Strategy).all()
for s in strats:
    if s.risk_config:
        print(f"Strategy {s.name}: max_drawdown current = {s.risk_config.get('max_drawdown', {}).get('current', 'MISSING')}")
        break
db.close()
