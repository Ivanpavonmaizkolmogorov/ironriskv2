"""Portfolio service — orchestrates portfolio creation, recalculation, and CRUD."""

import logging
from typing import Optional
from sqlalchemy.orm import Session
from fastapi import HTTPException

import numpy as np

from models.portfolio import Portfolio
from models.strategy import Strategy
from core.risk_engine import RiskEngine

logger = logging.getLogger("ironrisk")


def ensure_default_portfolio(db: Session, trading_account_id: str) -> Portfolio:
    """Create or return the default 'Global' portfolio for a trading account."""
    portfolio = db.query(Portfolio).filter(
        Portfolio.trading_account_id == trading_account_id,
        Portfolio.is_default == True,
    ).first()

    if portfolio:
        return portfolio

    # Gather all existing strategy IDs for this account
    strategies = db.query(Strategy).filter(
        Strategy.trading_account_id == trading_account_id
    ).all()
    strategy_ids = [s.id for s in strategies]

    portfolio = Portfolio(
        trading_account_id=trading_account_id,
        name="Global",
        strategy_ids=strategy_ids,
        auto_include_new=True,
        is_default=True,
    )
    db.add(portfolio)
    db.commit()
    db.refresh(portfolio)
    logger.info(f"Created default portfolio '{portfolio.name}' with {len(strategy_ids)} strategies")

    # Recalculate if there are strategies
    if strategy_ids:
        recalculate_portfolio(db, portfolio)

    return portfolio


def recalculate_portfolio(db: Session, portfolio: Portfolio) -> Portfolio:
    """Merge equity curves chronologically and recompute all metrics."""
    strategies = db.query(Strategy).filter(
        Strategy.id.in_(portfolio.strategy_ids)
    ).all()

    if not strategies:
        portfolio.equity_curve = []
        portfolio.metrics_snapshot = {}
        portfolio.risk_config = _default_risk_config(0.0, 0.0)
        portfolio.max_drawdown_limit = 0.0
        portfolio.daily_loss_limit = 0.0
        portfolio.total_trades = 0
        portfolio.net_profit = 0.0
        portfolio.gauss_params = {}
        db.commit()
        return portfolio

    # 1. Merge all trades chronologically
    all_trades = []
    for s in strategies:
        if s.equity_curve:
            for point in s.equity_curve:
                all_trades.append({
                    "pnl": _point_pnl(point, s.equity_curve),
                    "date": point.get("date"),
                    "equity": point.get("equity", 0.0),
                    "strategy_id": s.id,
                    "strategy_name": s.name,
                })

    # Sort by date (chronological merge)
    all_trades.sort(key=lambda t: t.get("date") or "")

    if not all_trades:
        portfolio.equity_curve = []
        portfolio.total_trades = 0
        portfolio.net_profit = 0.0
        db.commit()
        return portfolio

    # 2. Rebuild combined equity curve
    pnls = [t["pnl"] for t in all_trades]
    equity_curve_values = list(np.cumsum(pnls))
    combined_equity_curve = [
        {
            "trade": i + 1,
            "equity": round(float(equity_curve_values[i]), 2),
            "date": all_trades[i].get("date"),
        }
        for i in range(len(all_trades))
    ]

    # 3. Compute metrics from combined pnls
    pnl_array = np.array(pnls)
    net_profit = float(np.sum(pnl_array))

    # Max drawdown from combined equity
    equities = np.array(equity_curve_values)
    peak = np.maximum.accumulate(equities)
    drawdowns = peak - equities
    max_drawdown = float(np.max(drawdowns)) if len(drawdowns) > 0 else 0.0

    # Worst daily loss from combined
    daily_pnl: dict[str, float] = {}
    for t in all_trades:
        day = (t.get("date") or "")[:10]
        daily_pnl[day] = daily_pnl.get(day, 0.0) + t["pnl"]
    worst_daily_loss = abs(min(daily_pnl.values())) if daily_pnl else 0.0

    # Gauss params
    gauss_params = {}
    if len(pnl_array) >= 2:
        gauss_params = {
            "mean": round(float(np.mean(pnl_array)), 2),
            "std": round(float(np.std(pnl_array)), 2),
            "median": round(float(np.median(pnl_array)), 2),
            "min": round(float(np.min(pnl_array)), 2),
            "max": round(float(np.max(pnl_array)), 2),
            "count": len(pnl_array),
        }

    # 4. Build metrics_snapshot (simplified for portfolio)
    metrics_snapshot = {
        "DrawdownMetric": {
            "max_drawdown": round(max_drawdown, 2),
        },
        "combined_strategies": len(strategies),
        "strategy_names": [s.name for s in strategies],
    }

    # Also run RiskEngine on the combined pnls for full analysis
    try:
        trades_for_engine = [{"pnl": float(p)} for p in pnls]
        engine = RiskEngine.create_default()
        full_metrics = engine.analyze_backtest(trades_for_engine)
        metrics_snapshot.update(full_metrics)
    except Exception as e:
        logger.warning(f"RiskEngine failed on portfolio: {e}")

    # 5. Build risk_config
    max_dd_limit = round(max_drawdown, 2)
    daily_loss_limit = round(worst_daily_loss, 2)

    cl_params = metrics_snapshot.get("ConsecutiveLossesMetric", {})
    sd_params = metrics_snapshot.get("StagnationDaysMetric", {})
    st_params = metrics_snapshot.get("StagnationTradesMetric", {})

    risk_config = {
        "max_drawdown": {"enabled": True, "limit": max_dd_limit},
        "daily_loss": {"enabled": True, "limit": daily_loss_limit},
        "consecutive_losses": {
            "enabled": False,
            "limit": cl_params.get("max_consecutive_losses", 0),
        },
        "stagnation_days": {
            "enabled": False,
            "limit": sd_params.get("max_stagnation_days", sd_params.get("percentile_95", 0)),
        },
        "stagnation_trades": {
            "enabled": False,
            "limit": st_params.get("max_stagnation_trades", st_params.get("percentile_95", 0)),
        },
    }

    # 6. Persist
    portfolio.equity_curve = combined_equity_curve
    portfolio.metrics_snapshot = metrics_snapshot
    portfolio.gauss_params = gauss_params
    portfolio.risk_config = risk_config
    portfolio.max_drawdown_limit = max_dd_limit
    portfolio.daily_loss_limit = daily_loss_limit
    portfolio.total_trades = len(all_trades)
    portfolio.net_profit = round(net_profit, 2)
    db.commit()
    db.refresh(portfolio)

    logger.info(
        f"Portfolio '{portfolio.name}' recalculated: "
        f"{len(all_trades)} trades, net={net_profit:.2f}, "
        f"maxDD={max_dd_limit}, dailyLoss={daily_loss_limit}"
    )
    return portfolio


def add_strategy_to_auto_portfolios(db: Session, strategy: Strategy) -> None:
    """Add a newly created strategy to all auto_include_new portfolios."""
    portfolios = db.query(Portfolio).filter(
        Portfolio.trading_account_id == strategy.trading_account_id,
        Portfolio.auto_include_new == True,
    ).all()

    for p in portfolios:
        ids = list(p.strategy_ids or [])
        if strategy.id not in ids:
            ids.append(strategy.id)
            p.strategy_ids = ids
            db.commit()
            recalculate_portfolio(db, p)
            logger.info(f"Auto-added strategy '{strategy.name}' to portfolio '{p.name}'")


def remove_strategy_from_portfolios(db: Session, strategy_id: str, trading_account_id: str) -> None:
    """Remove a deleted strategy from all portfolios and recalculate."""
    portfolios = db.query(Portfolio).filter(
        Portfolio.trading_account_id == trading_account_id,
    ).all()

    for p in portfolios:
        ids = list(p.strategy_ids or [])
        if strategy_id in ids:
            ids.remove(strategy_id)
            p.strategy_ids = ids
            db.commit()
            recalculate_portfolio(db, p)
            logger.info(f"Removed strategy from portfolio '{p.name}'")


def get_portfolios_for_account(db: Session, trading_account_id: str) -> list[Portfolio]:
    """Get all portfolios for a trading account."""
    return db.query(Portfolio).filter(
        Portfolio.trading_account_id == trading_account_id
    ).all()


def get_portfolio_by_id(db: Session, portfolio_id: str) -> Optional[Portfolio]:
    """Get a single portfolio by ID."""
    return db.query(Portfolio).filter(Portfolio.id == portfolio_id).first()


def get_default_portfolio(db: Session, trading_account_id: str) -> Optional[Portfolio]:
    """Get the default (Global) portfolio for a trading account."""
    return db.query(Portfolio).filter(
        Portfolio.trading_account_id == trading_account_id,
        Portfolio.is_default == True,
    ).first()


def _point_pnl(point: dict, curve: list) -> float:
    """Extract individual trade PnL from a point in an equity curve."""
    idx = point.get("trade", 1) - 1
    if idx == 0:
        return point.get("equity", 0.0)
    if idx < len(curve):
        prev = curve[idx - 1].get("equity", 0.0)
        return point.get("equity", 0.0) - prev
    return 0.0


def _default_risk_config(max_dd: float, daily_loss: float) -> dict:
    """Build default risk_config structure."""
    return {
        "max_drawdown": {"enabled": True, "limit": max_dd},
        "daily_loss": {"enabled": True, "limit": daily_loss},
        "consecutive_losses": {"enabled": False, "limit": 0},
        "stagnation_days": {"enabled": False, "limit": 0},
        "stagnation_trades": {"enabled": False, "limit": 0},
    }
