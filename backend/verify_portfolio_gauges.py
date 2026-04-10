"""Verify Portfolio Bayes Gauges — shows which child strategy contributes each 'worst' value."""
import sys
sys.path.insert(0, r"c:\Users\ivanp\Desktop\Symbols\Porfolios\ironriskv2\backend")

from models.database import SessionLocal
from models.portfolio import Portfolio
from models.strategy import Strategy

db = SessionLocal()
portfolio = db.query(Portfolio).filter(Portfolio.name == "DrGero0007").first()
if not portfolio:
    print("Portfolio not found!")
    sys.exit(1)

print(f"Portfolio: {portfolio.name} ({len(portfolio.strategy_ids)} strategies)")
strategies = db.query(Strategy).filter(Strategy.id.in_(portfolio.strategy_ids)).all()

METRICS = ["max_drawdown", "daily_loss", "stagnation_days", "stagnation_trades", "consecutive_losses"]

print(f"\n{'Strategy':<40} {'DD':>10} {'DLoss':>10} {'StagD':>10} {'StagT':>10} {'Consec':>10}")
print("=" * 100)

for s in strategies:
    rc = getattr(s, "risk_config", None) or {}
    row = []
    for m in METRICS:
        cfg = rc.get(m, {})
        v = cfg.get("current") if cfg else None
        row.append(f"{v}" if v is not None else "-")
    print(f"{s.name[:38]:<40} {row[0]:>10} {row[1]:>10} {row[2]:>10} {row[3]:>10} {row[4]:>10}")

print("-" * 100)
worst = {}
worst_src = {}
for m in METRICS:
    worst[m] = None
    worst_src[m] = "-"
    for s in strategies:
        rc = getattr(s, "risk_config", None) or {}
        cfg = rc.get(m, {})
        c = cfg.get("current") if cfg else None
        if c is not None and (worst[m] is None or c > worst[m]):
            worst[m] = c
            worst_src[m] = s.name[:30]

row = [f"{worst[m]}" if worst[m] is not None else "-" for m in METRICS]
print(f"{'WORST (gauge value)':<40} {row[0]:>10} {row[1]:>10} {row[2]:>10} {row[3]:>10} {row[4]:>10}")

print("\nSource breakdown:")
for m in METRICS:
    print(f"  {m:25s} = {worst[m]}  <- {worst_src[m]}")

db.close()
