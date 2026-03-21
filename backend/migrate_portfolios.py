"""Migration: create default Portfolio 'Global' for all existing trading accounts."""

import sys, os
sys.path.insert(0, os.path.dirname(__file__))

from models.database import SessionLocal
from models.trading_account import TradingAccount
from services.portfolio_service import ensure_default_portfolio


def migrate():
    db = SessionLocal()
    try:
        accounts = db.query(TradingAccount).all()
        print(f"Found {len(accounts)} trading accounts")

        for acc in accounts:
            portfolio = ensure_default_portfolio(db, acc.id)
            print(f"  Account '{acc.name}': Portfolio '{portfolio.name}' "
                  f"with {len(portfolio.strategy_ids)} strategies, "
                  f"net_profit={portfolio.net_profit}, "
                  f"max_dd={portfolio.max_drawdown_limit}, "
                  f"daily_loss={portfolio.daily_loss_limit}")

        print("Done!")
    finally:
        db.close()


if __name__ == "__main__":
    migrate()
