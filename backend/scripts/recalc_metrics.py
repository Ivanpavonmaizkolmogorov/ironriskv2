import os
import sys

# Add backend directory to path
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from models.database import SessionLocal
from models.strategy import Strategy
from models.portfolio import Portfolio
from core.risk_engine import RiskEngine
from services.stats.analyzer import DistributionAnalyzer
from services.portfolio_service import recalculate_portfolio

def run():
    db = SessionLocal()
    engine = RiskEngine.create_default()
    analyzer = DistributionAnalyzer()

    # Update Strategies
    strats = db.query(Strategy).all()
    count = 0
    for s in strats:
        if s.trades:
            s.metrics_snapshot = engine.analyze_backtest(s.trades)
            s.distribution_fit = analyzer.fit_all_metrics(s.trades)
            count += 1
    
    print(f"Updated {count} strategies.")

    # Update Portfolios
    ports = db.query(Portfolio).all()
    count_p = 0
    for p in ports:
        recalculate_portfolio(db, p)
        count_p += 1

    print(f"Updated {count_p} portfolios.")

    db.commit()
    db.close()

if __name__ == "__main__":
    run()
