from models.database import SessionLocal
from models.portfolio import Portfolio
from models.strategy import Strategy
from models.real_trade import RealTrade
from sqlalchemy import or_, and_
from dateutil import parser
from datetime import timezone

db = SessionLocal()
portfolio = db.query(Portfolio).filter(Portfolio.id == "0f258ea0-2b82-44b5-84f6-40a80e86853a").first()
print("Testing with portfolio:", portfolio.id)

strategies = db.query(Strategy).filter(Strategy.id.in_(portfolio.strategy_ids or [])).all()

conditions = []
for st in strategies:
    if st.magic_number is None:
        continue
        
    st_cond = RealTrade.magic_number.in_(st.all_magic_numbers)
    effective_start = portfolio.start_date if getattr(portfolio, "start_date", None) else st.start_date
    if effective_start:
        try:
            start_date_filter = parser.parse(effective_start)
            if start_date_filter.tzinfo is None:
                start_date_filter = start_date_filter.replace(tzinfo=timezone.utc)
            st_cond = and_(st_cond, RealTrade.close_time >= start_date_filter)
        except Exception as e:
            print("Parse Exception:", e)
    conditions.append(st_cond)

print("Conditions:", conditions)
query = db.query(RealTrade).filter(RealTrade.trading_account_id == portfolio.trading_account_id)
if conditions:
    query = query.filter(or_(*conditions))
    query = query.order_by(RealTrade.close_time.desc())
    try:
        trades = query.limit(50).all()
        print("Success, found trades:", len(trades))
    except Exception as e:
        import traceback
        traceback.print_exc()
else:
    print("No conditions.")
db.close()
