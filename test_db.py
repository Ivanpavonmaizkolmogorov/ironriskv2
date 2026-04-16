import sys
import os
sys.path.append(os.getcwd())
from backend.models.database import SessionLocal
from backend.models.trading_account import TradingAccount

db = SessionLocal()
accs = db.query(TradingAccount).all()
for a in accs:
    print(f"Name: {a.account_name}, Token: {a.api_token[:15]}..., MT5 Acc: {a.mt5_account_number}, Heartbeat: {a.last_heartbeat_at}")
