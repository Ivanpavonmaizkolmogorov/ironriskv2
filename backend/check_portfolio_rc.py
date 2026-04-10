import sys
sys.path.insert(0, r"c:\Users\ivanp\Desktop\Symbols\Porfolios\ironriskv2\backend")

from models.database import SessionLocal
from models.portfolio import Portfolio

db = SessionLocal()
portfolio = db.query(Portfolio).filter(Portfolio.name == "DrGero0007").first()

if portfolio and portfolio.risk_config:
    for m in ["max_drawdown", "daily_loss", "stagnation_days", "stagnation_trades", "consecutive_losses"]:
        cfg = portfolio.risk_config.get(m, {})
        print(f"{m:25s}: current = {cfg.get('current')}")
else:
    print("Not found or no risk_config")

db.close()
