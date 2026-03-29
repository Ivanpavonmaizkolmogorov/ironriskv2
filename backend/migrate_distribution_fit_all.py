import sys, os
sys.path.append(r'c:\Users\ivanp\Desktop\Symbols\Porfolios\ironriskv2\backend')

from models.database import SessionLocal
from models.strategy import Strategy
from core.risk_engine import RiskEngine
from services.stats.analyzer import DistributionAnalyzer

db = SessionLocal()
strategies = db.query(Strategy).all()

count = 0
for s in strategies:
    if not s.equity_curve:
        continue
        
    trades = []
    for i, pt in enumerate(s.equity_curve):
        pnl = float(pt['equity']) if i == 0 else float(pt['equity']) - float(s.equity_curve[i-1]['equity'])
        trades.append({
            "profit": float(pnl),
            "pnl": float(pnl),
            "time": pt['date']
        })
        
    engine = RiskEngine.create_default()
    ms = engine.analyze_backtest(trades)
    
    analyzer = DistributionAnalyzer()
    dfit = analyzer.analyze_strategy(trades)
    
    s.metrics_snapshot = ms
    s.distribution_fit = dfit
    
    # Also add expected_payoff to risk_config if not present
    rc = dict(s.risk_config) if s.risk_config else {}
    if "expected_payoff" not in rc:
        ep_params = ms.get("PnlMetric", {})
        rc["expected_payoff"] = {
            "enabled": True,
            "limit": round(ep_params.get("mean_pnl", 0) - 2 * ep_params.get("std_pnl", 0), 2),
            "current": 0
        }
        s.risk_config = rc
    count += 1
    
db.commit()
print(f"Migration completed. Recalculated {count} strategies.")
