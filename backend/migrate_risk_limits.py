"""Force re-populate all risk limits and risk_config from backtest data."""

import sys, os, json
sys.path.insert(0, os.path.dirname(__file__))

from models.database import SessionLocal
from models.strategy import Strategy


def migrate():
    db = SessionLocal()
    try:
        strategies = db.query(Strategy).all()
        for s in strategies:
            ms = s.metrics_snapshot or {}
            
            # Force recalculate max_drawdown_limit from backtest
            dd = ms.get("DrawdownMetric", {})
            backtest_max_dd = dd.get("max_drawdown", 0.0)
            if backtest_max_dd > 0:
                s.max_drawdown_limit = round(backtest_max_dd, 2)
                print(f"  {s.name}: max_drawdown_limit = {s.max_drawdown_limit}")

            # Force recalculate daily_loss_limit from equity curve
            if s.equity_curve:
                daily_pnl = {}
                prev_eq = 0.0
                for pt in s.equity_curve:
                    date_str = pt.get("date") or ""
                    day_key = date_str[:10] if date_str else "unknown"
                    trade_pnl = pt["equity"] - prev_eq
                    daily_pnl[day_key] = daily_pnl.get(day_key, 0.0) + trade_pnl
                    prev_eq = pt["equity"]
                if daily_pnl:
                    worst = abs(min(daily_pnl.values()))
                    if worst > 0:
                        s.daily_loss_limit = round(worst, 2)
                        print(f"  {s.name}: daily_loss_limit = {s.daily_loss_limit}")

            # Force rebuild risk_config
            cl = ms.get("ConsecutiveLossesMetric", {})
            sd = ms.get("StagnationDaysMetric", {})
            st = ms.get("StagnationTradesMetric", {})

            s.risk_config = {
                "max_drawdown": {"enabled": True, "limit": s.max_drawdown_limit},
                "daily_loss": {"enabled": True, "limit": s.daily_loss_limit},
                "consecutive_losses": {
                    "enabled": False,
                    "limit": cl.get("max_consecutive_losses", 0),
                },
                "stagnation_days": {
                    "enabled": False,
                    "limit": sd.get("max_stagnation_days", sd.get("percentile_95", 0)),
                },
                "stagnation_trades": {
                    "enabled": False,
                    "limit": st.get("max_stagnation_trades", st.get("percentile_95", 0)),
                },
            }
            print(f"  {s.name}: risk_config = {json.dumps(s.risk_config)}")

        db.commit()
        print(f"\nDone. Updated {len(strategies)} strategies.")
    finally:
        db.close()


if __name__ == "__main__":
    migrate()
