"""Strategy service — orchestrates strategy creation with CSV processing."""

import logging
from sqlalchemy.orm import Session
from fastapi import HTTPException

from models.strategy import Strategy
from services.csv_parser import parse_csv
from core.risk_engine import RiskEngine

logger = logging.getLogger("ironrisk")


def create_strategy_from_csv(
    db: Session,
    user_id: str,
    name: str,
    description: str,
    magic_number: int,
    start_date: str | None,
    max_drawdown_limit: float,
    daily_loss_limit: float,
    csv_content: bytes,
) -> Strategy:
    """Full pipeline: parse CSV → run RiskEngine → persist strategy."""

    # 1. Parse CSV
    logger.info(f"Parsing CSV for strategy '{name}' (user: {user_id}, {len(csv_content)} bytes)")
    trades, summary = parse_csv(csv_content)
    logger.info(f"CSV parsed OK: {summary['total_trades']} trades, net_profit={summary['net_profit']:.2f}")

    # 2. Run metrics engine
    logger.info("Running RiskEngine analysis...")
    engine = RiskEngine.create_default()
    metrics_snapshot = engine.analyze_backtest(trades)
    logger.info(f"RiskEngine OK: {list(metrics_snapshot.keys())}")

    # 3. Create and persist strategy
    logger.info("Persisting strategy to DB...")
    strategy = Strategy(
        user_id=user_id,
        name=name,
        description=description,
        magic_number=magic_number,
        start_date=start_date,
        max_drawdown_limit=max_drawdown_limit,
        daily_loss_limit=daily_loss_limit,
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
    return strategy


def get_user_strategies(db: Session, user_id: str):
    return db.query(Strategy).filter(Strategy.user_id == user_id).all()


def get_strategy_by_id(db: Session, strategy_id: str, user_id: str) -> Strategy:
    strategy = db.query(Strategy).filter(
        Strategy.id == strategy_id, Strategy.user_id == user_id
    ).first()
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")
    return strategy


def get_strategy_by_magic(db: Session, user_id: str, magic_number: int) -> Strategy:
    strategy = db.query(Strategy).filter(
        Strategy.user_id == user_id, Strategy.magic_number == magic_number
    ).first()
    if not strategy:
        raise HTTPException(status_code=404, detail="No strategy with that magic number")
    return strategy


def delete_strategy(db: Session, strategy_id: str, user_id: str) -> None:
    strategy = get_strategy_by_id(db, strategy_id, user_id)
    db.delete(strategy)
    db.commit()
