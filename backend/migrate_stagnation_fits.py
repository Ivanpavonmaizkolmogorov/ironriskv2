import sys
sys.path.append(r'c:\Users\ivanp\Desktop\Symbols\Porfolios\ironriskv2\backend')

from models.database import SessionLocal
from models.strategy import Strategy
from models.portfolio import Portfolio
from services.stats.analyzer import DistributionAnalyzer
from sqlalchemy.orm.attributes import flag_modified

db = SessionLocal()
analyzer = DistributionAnalyzer()

# 1. Update all Strategies
strategies = db.query(Strategy).all()
s_count = 0
for s in strategies:
    if not s.equity_curve:
        continue
        
    trades = []
    # Reconstruct trades array from equity_curve
    for i, pt in enumerate(s.equity_curve):
        pnl = float(pt['equity']) if i == 0 else float(pt['equity']) - float(s.equity_curve[i-1]['equity'])
        trades.append({
            "profit": float(pnl),
            "pnl": float(pnl),
            "time": pt.get('date', "")
        })
        
    # Re-run distribution analyzer to pick up new discrete distributions (NegBin, Geom, Poisson)
    s.distribution_fit = analyzer.analyze_strategy(trades)
    flag_modified(s, "distribution_fit")
    s_count += 1

# 2. Update all Portfolios
portfolios = db.query(Portfolio).all()
p_count = 0
for p in portfolios:
    if not p.equity_curve:
        continue
        
    trades = []
    # Reconstruct trades array from the portfolio's aggregated equity_curve
    for i, pt in enumerate(p.equity_curve):
        pnl = float(pt['equity']) if i == 0 else float(pt['equity']) - float(p.equity_curve[i-1]['equity'])
        trades.append({
            "profit": float(pnl),
            "pnl": float(pnl),
            "time": pt.get('date', "")
        })
        
    p.distribution_fit = analyzer.analyze_strategy(trades)
    flag_modified(p, "distribution_fit")
    p_count += 1

db.commit()
print(f"Migration completed. Re-fitted {s_count} strategies and {p_count} portfolios with discrete models.")
