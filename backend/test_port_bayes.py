from models.database import SessionLocal
from api.portfolios import get_portfolio_bayes

db = SessionLocal()

# We call the function directly. User is not actually used inside get_portfolio_bayes.
res = get_portfolio_bayes("0f258ea0-2b82-44b5-84f6-40a80e86853a", db=db)
print("Return from get_portfolio_bayes:")
print("max_drawdown gauge:", res.get("risk_gauges", {}).get("max_drawdown"))
