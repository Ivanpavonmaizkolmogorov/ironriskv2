"""Recompute metrics_snapshot + distribution_fit for all strategies & portfolios.

equity_curve has the format: [{"trade": 1, "equity": 138.97, "date": "2020.01.03 12:00:00"}, ...]
Metrics expect trades with: {"time": "2020.01.03", "profit": 50.0, "pnl": 50.0}
We derivate profit from consecutive equity differences.
"""
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


def equity_to_trades(equity_curve: list[dict]) -> list[dict]:
    """Convert equity curve to trade-like dicts with profit/pnl/time fields."""
    if not equity_curve or len(equity_curve) < 2:
        return []
    
    trades = []
    prev_equity = equity_curve[0].get("equity", 0)
    
    for i, point in enumerate(equity_curve[1:], start=1):
        equity = point.get("equity", 0)
        profit = equity - prev_equity
        date_str = point.get("date", "")
        
        trades.append({
            "trade": i,
            "time": date_str,
            "date": date_str,
            "exit_time": date_str,
            "profit": profit,
            "pnl": profit,
        })
        prev_equity = equity
    
    return trades


def run():
    db = SessionLocal()
    engine = RiskEngine.create_default()
    analyzer = DistributionAnalyzer()

    # Update Strategies
    strats = db.query(Strategy).all()
    count = 0
    for s in strats:
        eq = s.equity_curve or []
        if eq:
            trades = equity_to_trades(eq)
            if trades:
                s.metrics_snapshot = engine.analyze_backtest(trades)
                s.distribution_fit = analyzer.analyze_strategy(trades)
                count += 1
                ms = s.metrics_snapshot or {}
                dl = ms.get('DailyLossMetric', {}).get('max_daily_loss', 'N/A')
                sd = ms.get('StagnationDaysMetric', {}).get('max_stagnation_days', 'N/A')
                print(f"  {s.name[:40]:40s} | DailyLoss={dl} StagDays={sd}")
    
    print(f"\nUpdated {count} strategies.")

    # Update Portfolios
    ports = db.query(Portfolio).all()
    count_p = 0
    for p in ports:
        recalculate_portfolio(db, p)
        count_p += 1

    print(f"Updated {count_p} portfolios.")

    db.commit()
    db.close()
    print("Done!")

if __name__ == "__main__":
    run()
