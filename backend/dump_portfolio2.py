import json
from models.database import SessionLocal
from models.portfolio import Portfolio
from models.strategy import Strategy

with open("portfolio_dump.txt", "w") as f:
    db = SessionLocal()
    portfolios = db.query(Portfolio).all()

    for p in portfolios:
        f.write(f"PORTFOLIO: {p.name} (ID: {p.id})\n")
        f.write(f"  max_drawdown_limit: {p.max_drawdown_limit}\n")
        f.write(f"  metrics_snapshot.DrawdownMetric: {p.metrics_snapshot.get('DrawdownMetric', {}) if p.metrics_snapshot else None}\n")
        
        rc = p.risk_config or {}
        f.write(f"  risk_config.max_drawdown: {rc.get('max_drawdown', {})}\n")
        f.write(f"  distribution_fit.max_drawdown: {bool((p.distribution_fit or {}).get('max_drawdown'))}\n")
        
        f.write("  STRATEGIES:\n")
        if p.strategy_ids:
            strats = db.query(Strategy).filter(Strategy.id.in_(p.strategy_ids)).all()
            for s in strats:
                f.write(f"    - {s.name} (magic: {s.magic_number}):\n")
                src = s.risk_config or {}
                f.write(f"      risk_config.max_drawdown: {src.get('max_drawdown', {})}\n")
        f.write("-" * 50 + "\n")
