import sqlite3, json, pandas as pd
import sys
sys.path.append(r'c:\Users\ivanp\Desktop\Symbols\Porfolios\ironriskv2\backend')
from models.database import SessionLocal
from models.strategy import Strategy
from services.stats.analyzer import DistributionAnalyzer

db = SessionLocal()
s = db.query(Strategy).filter(Strategy.name.like('%18%BuyStop%')).first()

analyzer = DistributionAnalyzer()
trades = []

for i, pt in enumerate(s.equity_curve):
    pnl = float(pt['equity']) if i == 0 else float(pt['equity']) - float(s.equity_curve[i-1]['equity'])
    trades.append({
        "profit": float(pnl),
        "time": pt.get('time', pt.get('date', ""))
    })

fit = analyzer.analyze_strategy(trades)
print("Distribution fits:")
print(fit['stagnation_days'])
