"""Strategy service — orchestrates strategy creation with CSV processing."""

import logging
from sqlalchemy.orm import Session
from fastapi import HTTPException

from models.strategy import Strategy
from schemas.strategy import StrategyUpdate
from services.csv_parser import parse_csv
from core.risk_engine import RiskEngine
from services.portfolio_service import (
    add_strategy_to_auto_portfolios,
    remove_strategy_from_portfolios,
    ensure_default_portfolio,
)

logger = logging.getLogger("ironrisk")


def create_strategy_from_csv(
    db: Session,
    trading_account_id: str,
    name: str,
    description: str,
    magic_number: int,
    start_date: str | None,
    max_drawdown_limit: float,
    daily_loss_limit: float,
    csv_content: bytes,
    column_mapping: dict | None = None,
) -> Strategy:
    """Full pipeline: parse CSV → run RiskEngine → persist strategy.
    
    UPSERT: If a strategy with the same magic_number + trading_account_id already
    exists, it will be updated with the new CSV data (only if there are new trades).
    The existing strategy ID, risk_config, and portfolio associations are preserved.
    """

    # 1. Parse CSV
    logger.info(f"Parsing CSV for strategy '{name}' ({len(csv_content)} bytes)")
    trades, summary = parse_csv(csv_content, column_mapping=column_mapping)
    logger.info(f"CSV parsed OK: {summary['total_trades']} trades, net_profit={summary['net_profit']:.2f}")

    # 2. Run metrics engine
    logger.info("Running RiskEngine analysis...")
    engine = RiskEngine.create_default()
    metrics_snapshot = engine.analyze_backtest(trades)
    logger.info(f"RiskEngine OK: {list(metrics_snapshot.keys())}")

    # ── UPSERT CHECK: does a strategy with this magic already exist? ──
    existing = None
    if magic_number and magic_number != 0:
        existing = db.query(Strategy).filter(
            Strategy.trading_account_id == trading_account_id,
            Strategy.magic_number == magic_number,
        ).first()

    if existing:
        old_count = existing.total_trades or 0
        new_count = summary["total_trades"]
        if new_count <= old_count:
            logger.info(
                f"Upsert: strategy '{existing.name}' (magic={magic_number}) "
                f"already has {old_count} trades, CSV has {new_count}. "
                f"No new trades — skipping update."
            )
            return existing  # Nothing new

        logger.info(
            f"Upsert: strategy '{existing.name}' (magic={magic_number}) "
            f"updating from {old_count} → {new_count} trades "
            f"({new_count - old_count} new)"
        )
        # Update data fields, PRESERVE risk_config and identity
        existing.metrics_snapshot = metrics_snapshot
        existing.equity_curve = summary["equity_curve"]
        existing.gauss_params = summary["gauss_params"]
        existing.total_trades = summary["total_trades"]
        existing.net_profit = summary["net_profit"]
        # Update limits only if they were auto-populated (0) or if the new backtest suggests larger values
        dd_data = metrics_snapshot.get("DrawdownMetric", {})
        backtest_max_dd = dd_data.get("max_drawdown", 0.0)
        if existing.max_drawdown_limit == 0.0 and backtest_max_dd > 0:
            existing.max_drawdown_limit = round(backtest_max_dd, 2)
        backtest_daily = summary.get("worst_daily_loss", 0.0)
        if existing.daily_loss_limit == 0.0 and backtest_daily > 0:
            existing.daily_loss_limit = round(backtest_daily, 2)
        db.commit()
        db.refresh(existing)
        logger.info(f"Upsert complete: '{existing.name}' now has {new_count} trades")
        return existing

    # ── NEW STRATEGY (no existing match) ──

    # 3. Auto-populate risk limits from backtest if not set by user
    if max_drawdown_limit == 0.0:
        dd_data = metrics_snapshot.get("DrawdownMetric", {})
        backtest_max_dd = dd_data.get("max_drawdown", 0.0)
        if backtest_max_dd > 0:
            max_drawdown_limit = round(backtest_max_dd, 2)
            logger.info(f"Auto-populated max_drawdown_limit from backtest: {max_drawdown_limit}")

    if daily_loss_limit == 0.0:
        backtest_daily = summary.get("worst_daily_loss", 0.0)
        if backtest_daily > 0:
            daily_loss_limit = round(backtest_daily, 2)
            logger.info(f"Auto-populated daily_loss_limit from backtest: {daily_loss_limit}")

    # 4. Build default risk_config from backtest metrics
    dd_params = metrics_snapshot.get("DrawdownMetric", {})
    cl_params = metrics_snapshot.get("ConsecutiveLossesMetric", {})
    sd_params = metrics_snapshot.get("StagnationDaysMetric", {})
    st_params = metrics_snapshot.get("StagnationTradesMetric", {})

    risk_config = {
        "max_drawdown": {"enabled": True, "limit": max_drawdown_limit},
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
    logger.info(f"Default risk_config: {risk_config}")

    # 5. Create and persist strategy
    logger.info("Persisting strategy to DB...")
    strategy = Strategy(
        trading_account_id=trading_account_id,
        name=name,
        description=description,
        magic_number=magic_number,
        start_date=start_date,
        max_drawdown_limit=max_drawdown_limit,
        daily_loss_limit=daily_loss_limit,
        risk_config=risk_config,
        metrics_snapshot=metrics_snapshot,
        equity_curve=summary["equity_curve"],
        gauss_params=summary["gauss_params"],
        total_trades=summary["total_trades"],
        net_profit=summary["net_profit"],
    )
    db.add(strategy)
    db.commit()
    db.refresh(strategy)
    logger.info(f"Strategy '{name}' created with id={strategy.id}")

    # Auto-add to portfolios with auto_include_new=True (e.g., Global)
    ensure_default_portfolio(db, trading_account_id)
    add_strategy_to_auto_portfolios(db, strategy)
    return strategy


from models.trading_account import TradingAccount

def get_user_strategies(db: Session, user_id: str):
    return db.query(Strategy).join(TradingAccount).filter(TradingAccount.user_id == user_id).all()


def get_strategy_by_id(db: Session, strategy_id: str, user_id: str) -> Strategy:
    strategy = db.query(Strategy).join(TradingAccount).filter(
        Strategy.id == strategy_id, TradingAccount.user_id == user_id
    ).first()
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")
    return strategy


def get_strategy_by_magic(db: Session, trading_account_id: str, magic_number: int) -> Strategy:
    strategy = db.query(Strategy).filter(
        Strategy.trading_account_id == trading_account_id, Strategy.magic_number == magic_number
    ).first()
    if not strategy:
        raise HTTPException(status_code=404, detail="No strategy with that magic number in this account")
    return strategy


def delete_strategy(db: Session, strategy_id: str, user_id: str) -> None:
    strategy = get_strategy_by_id(db, strategy_id, user_id)
    # Remove from all portfolios and recalculate
    remove_strategy_from_portfolios(db, strategy.id, strategy.trading_account_id)
    db.delete(strategy)
    db.commit()


def update_strategy(
    db: Session, strategy_id: str, user_id: str, update_data: StrategyUpdate
) -> Strategy:
    """Update allowed fields on an existing strategy."""
    strategy = get_strategy_by_id(db, strategy_id, user_id)

    update_dict = update_data.model_dump(exclude_unset=True)
    for field, value in update_dict.items():
        setattr(strategy, field, value)

    db.commit()
    db.refresh(strategy)
    return strategy
