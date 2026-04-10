from models.database import SessionLocal
from models.portfolio import Portfolio
from services.portfolio_service import get_portfolio_by_id

db = SessionLocal()
portfolio = get_portfolio_by_id(db, "0f258ea0-2b82-44b5-84f6-40a80e86853a")

dist_fit = getattr(portfolio, "distribution_fit", None) or {}
risk_config = getattr(portfolio, "risk_config", None) or {}

print("Database Portfolio details for gauge generation:")
for metric_name in ["max_drawdown", "daily_loss", "stagnation_days", "stagnation_trades", "consecutive_losses"]:
    fit_dict = dist_fit.get(metric_name)
    cfg = risk_config.get(metric_name, {})
    current = cfg.get("current") if cfg else None
    print(f"{metric_name}:")
    print(f"  fit_dict exists: {bool(fit_dict)}")
    print(f"  cfg: {cfg}")
    print(f"  current extracted: {current}")

print("\nWAIT! What is portfolio.risk_config EXACTLY?")
print(portfolio.risk_config)
