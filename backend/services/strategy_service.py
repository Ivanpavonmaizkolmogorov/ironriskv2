"""Strategy service — orchestrates strategy creation with CSV processing."""

import logging
from sqlalchemy.orm import Session
from fastapi import HTTPException

from models.strategy import Strategy
from schemas.strategy import StrategyUpdate
from services.csv_parser import parse_csv
from core.risk_engine import RiskEngine
from services.stats.analyzer import DistributionAnalyzer
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
    filename: str = "upload.csv",
    column_mapping: dict | None = None,
    skip_recalc: bool = False,
) -> Strategy:
    """Full pipeline: parse CSV → run RiskEngine → persist strategy.
    
    UPSERT: If a strategy with the same magic_number + trading_account_id already
    exists, it will be updated with the new CSV data (only if there are new trades).
    The existing strategy ID, risk_config, and portfolio associations are preserved.
    """

    # 1. Parse CSV
    logger.info(f"Parsing CSV for strategy '{name}' ({len(csv_content)} bytes)")
    trades, summary = parse_csv(csv_content, filename, column_mapping=column_mapping)
    logger.info(f"CSV parsed OK: {summary['total_trades']} trades, net_profit={summary['net_profit']:.2f}")

    # Auto-populate start_date from last CSV trade if not provided
    if not start_date and summary.get("last_trade_date"):
        start_date = summary["last_trade_date"]
        logger.info(f"Auto-populated start_date from last CSV trade: {start_date}")

    # 2. Run metrics engine
    logger.info("Running RiskEngine analysis...")
    engine = RiskEngine.create_default()
    metrics_snapshot = engine.analyze_backtest(trades)
    logger.info(f"RiskEngine OK: {list(metrics_snapshot.keys())}")

    # 3. Run distribution fitting on all registered metrics
    logger.info("Running DistributionAnalyzer...")
    analyzer = DistributionAnalyzer()
    trade_dicts = [{"profit": t["pnl"], "time": t.get("exit_time", "")} for t in trades]
    distribution_fit = analyzer.analyze_strategy(trade_dicts)
    logger.info(f"DistributionAnalyzer OK: {list(distribution_fit.keys())}")

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

        logger.info(
            f"Upsert: strategy '{existing.name}' (magic={magic_number}) "
            f"updating from {old_count} -> {new_count} trades "
            f"(force recalculating metrics)"
        )
        # Update data fields, PRESERVE risk_config and identity
        existing.metrics_snapshot = metrics_snapshot
        existing.equity_curve = summary["equity_curve"]
        existing.original_equity_curve = summary["equity_curve"]
        existing.gauss_params = summary["gauss_params"]
        existing.distribution_fit = distribution_fit
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
        original_equity_curve=summary["equity_curve"],
        gauss_params=summary["gauss_params"],
        distribution_fit=distribution_fit,
        total_trades=summary["total_trades"],
        net_profit=summary["net_profit"],
    )
    db.add(strategy)
    db.commit()
    db.refresh(strategy)
    logger.info(f"Strategy '{name}' created with id={strategy.id}")

    # Auto-add to portfolios with auto_include_new=True (e.g., Global)
    ensure_default_portfolio(db, trading_account_id)
    add_strategy_to_auto_portfolios(db, strategy, skip_recalc=skip_recalc)
    return strategy


def create_strategy_from_simulation(
    db: Session,
    trading_account_id: str,
    name: str,
    magic_number: int = 0,
    risk_config: dict | None = None,
    decomposition: dict | None = None,
    risk_suggestions: dict | None = None,
    extracted_stats: dict | None = None,
    equity_curve: list | None = None,
    start_date: str | None = None,
    bt_discount: float = 10.0,
) -> Strategy:
    """Create a strategy from simulator data with full backtest context.
    
    The simulator flow now passes the same equity_curve and start_date
    that the workspace CSV upload does, ensuring consistent data across
    both creation paths.
    """
    # Build risk_config from provided data or defaults
    rc = risk_config or {}
    final_risk_config = {
        "max_drawdown": {
            "enabled": rc.get("max_drawdown", {}).get("enabled", True),
            "limit": rc.get("max_drawdown", {}).get("limit", 0),
        },
        "daily_loss": {
            "enabled": rc.get("daily_loss", {}).get("enabled", True),
            "limit": rc.get("daily_loss", {}).get("limit", 0),
        },
        "consecutive_losses": {
            "enabled": rc.get("consecutive_losses", {}).get("enabled", False),
            "limit": rc.get("consecutive_losses", {}).get("limit", 0),
        },
        "stagnation_days": {
            "enabled": rc.get("stagnation_days", {}).get("enabled", False),
            "limit": rc.get("stagnation_days", {}).get("limit", 0),
        },
        "stagnation_trades": {
            "enabled": rc.get("stagnation_trades", {}).get("enabled", False),
            "limit": rc.get("stagnation_trades", {}).get("limit", 0),
        },
    }

    max_dd_limit = final_risk_config["max_drawdown"]["limit"]
    daily_loss_limit = final_risk_config["daily_loss"]["limit"]

    # Compute Expectancy & Net Profit from Decomposition
    dc = decomposition or {}
    rs = risk_suggestions or {}
    es = extracted_stats or {}

    total_trades = es.get("n_trades", 0)
    
    if not total_trades and dc:
        # Fallback if no extracted_stats
        tp_month = dc.get("tradesPerMonth", 0)
        months = dc.get("months", 0)
        total_trades = int(tp_month * months)

    ev = float(rs.get("ev_per_trade", 0.0))
    net_profit = float(ev * total_trades)

    # Map Simulator Risk Suggestions into the metrics_snapshot (so the Dashboard displays Ref Vals)
    ms = {}
    if rs:
        mapping = {
            "max_drawdown": ("DrawdownMetric", "max_max_drawdown"),
            "daily_loss": ("DailyLossMetric", "max_daily_loss"),
            "consecutive_losses": ("ConsecutiveLossesMetric", "max_consecutive_losses"),
            "stagnation_days": ("StagnationDaysMetric", "max_stagnation_days"),
            "stagnation_trades": ("StagnationTradesMetric", "max_stagnation_trades"),
        }
        for sim_k, (snap_k, inner_k) in mapping.items():
            if sim_k in rs:
                ms[snap_k] = {inner_k: rs[sim_k]}

    # Save exactly what the trader pushed into the Simulator
    if es:
        ms["SimulationParameters"] = es

    # ── Equity curve & distribution fitting ──
    # When the simulator had a file uploaded, we get the same equity_curve
    # that workspace CSV upload produces. Use it for Bayes + charts.
    final_equity_curve = equity_curve or []
    gauss_params = {}
    distribution_fit = {}
    
    if final_equity_curve and len(final_equity_curve) > 1:
        # Extract PnL sequence from equity curve for distribution analysis
        import numpy as np
        pnls = []
        for i in range(1, len(final_equity_curve)):
            prev = final_equity_curve[i-1].get("equity", 0) if isinstance(final_equity_curve[i-1], dict) else 0
            curr = final_equity_curve[i].get("equity", 0) if isinstance(final_equity_curve[i], dict) else 0
            pnls.append(curr - prev)
        
        if pnls:
            pnl_arr = np.array(pnls, dtype=np.float64)
            gauss_params = {
                "mean": float(np.mean(pnl_arr)),
                "std": float(np.std(pnl_arr)),
                "median": float(np.median(pnl_arr)),
                "count": len(pnl_arr),
            }
            net_profit = float(np.sum(pnl_arr))
            total_trades = len(pnl_arr)
            
            # Run full risk engine analysis for accurate metrics_snapshot
            engine = RiskEngine.create_default()
            trade_dicts = [{"pnl": p} for p in pnls]
            bt_metrics = engine.analyze_backtest(trade_dicts)
            # Merge: keep SimulationParameters but override metric values with real data
            for k, v in bt_metrics.items():
                if k != "SimulationParameters":
                    ms[k] = v
            
            # Run distribution fitting
            analyzer = DistributionAnalyzer()
            trade_analysis_dicts = [{"profit": p, "time": ""} for p in pnls]
            distribution_fit = analyzer.analyze_strategy(trade_analysis_dicts)
            logger.info(f"Distribution fitting OK: {list(distribution_fit.keys())}")
    
    # Auto-derive start_date from equity_curve last point if not provided
    if not start_date and final_equity_curve:
        last_point = final_equity_curve[-1] if final_equity_curve else None
        if last_point and isinstance(last_point, dict) and last_point.get("date"):
            start_date = last_point["date"]
            logger.info(f"Auto-populated start_date from equity curve last point: {start_date}")

    strategy = Strategy(
        trading_account_id=trading_account_id,
        name=name,
        description="",
        magic_number=magic_number,
        start_date=start_date,
        max_drawdown_limit=max_dd_limit,
        daily_loss_limit=daily_loss_limit,
        risk_config=final_risk_config,
        metrics_snapshot=ms,
        equity_curve=final_equity_curve,
        gauss_params=gauss_params,
        distribution_fit=distribution_fit,
        total_trades=total_trades,
        net_profit=net_profit,
        bt_discount=bt_discount,
    )
    db.add(strategy)
    db.commit()
    db.refresh(strategy)
    logger.info(f"Strategy '{name}' created from simulation (equity_curve={len(final_equity_curve)} points, start_date={start_date}) id={strategy.id}")

    ensure_default_portfolio(db, trading_account_id)
    add_strategy_to_auto_portfolios(db, strategy, skip_recalc=True)
    return strategy


from models.trading_account import TradingAccount

def get_user_strategies(db: Session, user_id: str, trading_account_id: str = None):
    query = db.query(Strategy).join(TradingAccount).filter(TradingAccount.user_id == user_id)
    if trading_account_id:
        query = query.filter(Strategy.trading_account_id == trading_account_id)
    return query.all()


def get_strategy_by_id(db: Session, strategy_id: str, user_id: str) -> Strategy:
    strategy = db.query(Strategy).join(TradingAccount).filter(
        Strategy.id == strategy_id, TradingAccount.user_id == user_id
    ).first()
    if not strategy:
        raise HTTPException(status_code=404, detail="Strategy not found")
    return strategy


def get_strategy_by_magic(db: Session, trading_account_id: str, magic_number: int) -> Strategy:
    """Find strategy by primary magic_number OR by alias."""
    # Try primary magic first
    strategy = db.query(Strategy).filter(
        Strategy.trading_account_id == trading_account_id, Strategy.magic_number == magic_number
    ).first()
    if strategy:
        return strategy
    
    # Fallback: search in magic_aliases (JSON contains)
    all_strategies = db.query(Strategy).filter(
        Strategy.trading_account_id == trading_account_id
    ).all()
    for s in all_strategies:
        if s.magic_aliases and magic_number in s.magic_aliases:
            return s
    
    raise HTTPException(status_code=404, detail="No strategy with that magic number in this account")


def delete_strategy(db: Session, strategy_id: str, user_id: str) -> None:
    strategy = get_strategy_by_id(db, strategy_id, user_id)
    # Remove from all portfolios and recalculate
    remove_strategy_from_portfolios(db, strategy.id, strategy.trading_account_id)
    db.delete(strategy)
    db.commit()


def delete_strategies_bulk(db: Session, strategy_ids: list[str], user_id: str) -> int:
    """Deletes multiple strategies efficiently."""
    strategies = db.query(Strategy).join(TradingAccount).filter(
        Strategy.id.in_(strategy_ids), TradingAccount.user_id == user_id
    ).all()

    if not strategies:
        return 0

    trading_account_id = strategies[0].trading_account_id
    valid_ids = [s.id for s in strategies]
    
    # 1. Update portfolios in bulk!
    from services.portfolio_service import remove_strategies_bulk_from_portfolios
    remove_strategies_bulk_from_portfolios(db, valid_ids, trading_account_id)

    # 2. Delete the strategies
    for s in strategies:
        db.delete(s)
    db.commit()

    return len(valid_ids)


def update_strategy(
    db: Session, strategy_id: str, user_id: str, update_data: StrategyUpdate
) -> Strategy:
    """Update allowed fields on an existing strategy."""
    strategy = get_strategy_by_id(db, strategy_id, user_id)

    update_dict = update_data.model_dump(exclude_unset=True)
    logger.info(f"[update_strategy] Received payload for {strategy_id}: {update_dict}")
    
    for field, value in update_dict.items():
        setattr(strategy, field, value)

    from sqlalchemy.orm.attributes import flag_modified
    if "metrics_snapshot" in update_dict:
        flag_modified(strategy, "metrics_snapshot")
    if "risk_config" in update_dict:
        flag_modified(strategy, "risk_config")
    if "magic_aliases" in update_dict:
        flag_modified(strategy, "magic_aliases")

    db.commit()
    db.refresh(strategy)
    return strategy


def compute_portfolio_bt_discount(strategies: list) -> float:
    """Weighted average bt_discount for portfolio-level Bayesian analysis.
    
    Weight = number of backtest trades per strategy.
    Future-ready: use when running Bayes at portfolio level.
    """
    total_trades = sum(s.total_trades for s in strategies) or 1
    return sum(s.total_trades * (s.bt_discount or 10.0) for s in strategies) / total_trades


def apply_risk_multiplier(
    db: Session, strategy_id: str, user_id: str, multiplier: float
) -> Strategy:
    """Apply a risk multiplier to all backtest PnL and re-run the full analysis pipeline.
    
    Reads original_equity_curve → scales by multiplier → re-derives:
      metrics_snapshot, distribution_fit, gauss_params, equity_curve, net_profit,
      max_drawdown_limit, daily_loss_limit, risk_config limits.
    """
    import numpy as np

    strategy = get_strategy_by_id(db, strategy_id, user_id)
    
    if multiplier <= 0:
        raise HTTPException(status_code=400, detail="multiplier must be > 0")
    
    # Use original curve; fallback to current equity_curve for legacy strategies
    source_curve = strategy.original_equity_curve or strategy.equity_curve or []
    if not source_curve or len(source_curve) < 2:
        raise HTTPException(status_code=400, detail="No backtest equity curve to scale")
    
    # Extract per-trade PnL from the ORIGINAL cumulative equity curve
    original_pnls = []
    for i in range(len(source_curve)):
        if isinstance(source_curve[i], dict):
            eq = source_curve[i].get("equity", 0)
        else:
            eq = source_curve[i]
        if i == 0:
            original_pnls.append(eq)  # first trade = first equity value
        else:
            prev_eq = source_curve[i-1].get("equity", 0) if isinstance(source_curve[i-1], dict) else source_curve[i-1]
            original_pnls.append(eq - prev_eq)
    
    # Scale PnL
    scaled_pnls = [p * multiplier for p in original_pnls]
    pnl_arr = np.array(scaled_pnls, dtype=np.float64)
    
    # Rebuild equity curve (cumulative)
    cum_equity = np.cumsum(pnl_arr).tolist()
    scaled_equity_curve = []
    for i, eq in enumerate(cum_equity):
        point = {"trade": i + 1, "equity": eq}
        if isinstance(source_curve[i], dict) and source_curve[i].get("date"):
            point["date"] = source_curve[i]["date"]
        scaled_equity_curve.append(point)
    
    # Re-run RiskEngine
    engine = RiskEngine.create_default()
    trade_dicts = [{"pnl": p} for p in scaled_pnls]
    metrics_snapshot = engine.analyze_backtest(trade_dicts)
    
    # Re-run DistributionAnalyzer
    analyzer = DistributionAnalyzer()
    trade_analysis = [{"profit": p, "time": ""} for p in scaled_pnls]
    distribution_fit = analyzer.analyze_strategy(trade_analysis)
    
    # Gauss params
    gauss_params = {
        "mean": float(np.mean(pnl_arr)),
        "std": float(np.std(pnl_arr)),
        "median": float(np.median(pnl_arr)),
        "count": len(pnl_arr),
    }
    
    net_profit = float(np.sum(pnl_arr))
    
    # Scale EA limits proportionally (user requested this)
    old_multiplier = strategy.risk_multiplier or 1.0
    if old_multiplier > 0 and old_multiplier != multiplier:
        scale_factor = multiplier / old_multiplier
        strategy.max_drawdown_limit = round(strategy.max_drawdown_limit * scale_factor, 2)
        strategy.daily_loss_limit = round(strategy.daily_loss_limit * scale_factor, 2)
        
        # Also scale risk_config limits
        rc = strategy.risk_config or {}
        for key in ["max_drawdown", "daily_loss", "consecutive_losses", "stagnation_days", "stagnation_trades"]:
            if key in rc and "limit" in rc[key]:
                # Only scale $ value limits (dd, daily), not count-based (consec, stagnation)
                if key in ("max_drawdown", "daily_loss"):
                    rc[key]["limit"] = round(rc[key]["limit"] * scale_factor, 2)
        strategy.risk_config = rc
    
    # Persist everything
    strategy.risk_multiplier = multiplier
    strategy.metrics_snapshot = metrics_snapshot
    strategy.equity_curve = scaled_equity_curve
    strategy.gauss_params = gauss_params
    strategy.distribution_fit = distribution_fit
    strategy.net_profit = net_profit
    
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(strategy, "metrics_snapshot")
    flag_modified(strategy, "equity_curve")
    flag_modified(strategy, "gauss_params")
    flag_modified(strategy, "distribution_fit")
    flag_modified(strategy, "risk_config")
    
    db.commit()
    db.refresh(strategy)
    logger.info(
        f"Applied risk_multiplier={multiplier} to strategy '{strategy.name}': "
        f"net_profit={net_profit:.2f}, dd_limit={strategy.max_drawdown_limit}"
    )
    
    # Recalculate portfolios that contain this strategy
    from services.portfolio_service import recalculate_portfolio
    from models.portfolio import Portfolio
    portfolios = db.query(Portfolio).filter(
        Portfolio.trading_account_id == strategy.trading_account_id
    ).all()
    for p in portfolios:
        sids = p.strategy_ids or []
        if strategy.id in sids:
            recalculate_portfolio(db, p)
    
    return strategy
