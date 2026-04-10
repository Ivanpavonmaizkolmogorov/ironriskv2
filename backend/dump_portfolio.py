import json
from models.database import SessionLocal
from models.portfolio import Portfolio
from models.strategy import Strategy

db = SessionLocal()
portfolios = db.query(Portfolio).all()

for p in portfolios:
    print(f"PORTFOLIO: {p.name} (ID: {p.id})")
    print(f"  max_drawdown_limit: {p.max_drawdown_limit}")
    print(f"  metrics_snapshot.DrawdownMetric: {p.metrics_snapshot.get('DrawdownMetric', {}) if p.metrics_snapshot else None}")
    
    rc = p.risk_config or {}
    print(f"  risk_config.max_drawdown: {rc.get('max_drawdown', {})}")
    print(f"  distribution_fit.max_drawdown: {bool((p.distribution_fit or {}).get('max_drawdown'))}")
    
    print("  STRATEGIES:")
    if p.strategy_ids:
        strats = db.query(Strategy).filter(Strategy.id.in_(p.strategy_ids)).all()
        for s in strats:
            print(f"    - {s.name} (magic: {s.magic_number}):")
            src = s.risk_config or {}
            print(f"      risk_config.max_drawdown: {src.get('max_drawdown', {})}")
    print("-" * 50)
