"""
Bayesian Cache Service — Pre-computes and persists the full Bayesian analysis
into strategy.metrics_snapshot["bayes_cache"].

Triggered by:
  - sync-trades (new live trades arrive)
  - Strategy creation/update (equity_curve, risk_config changes)
  - First dashboard load (fallback if cache is missing)
"""

import logging
import traceback
from datetime import timedelta, datetime

from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from models.strategy import Strategy

logger = logging.getLogger("ironrisk.bayes_cache")


def compute_bayes_result(db: Session, strategy: Strategy, sim_pnl_list: list[float] | None = None) -> dict:
    """
    Compute the full Bayesian analysis for a strategy.
    Returns the dict that the /bayes endpoint would return.
    
    If sim_pnl_list is provided, it's treated as ephemeral simulated PnL (sandbox mode).
    """
    from services.stats.bayes_engine import BayesEngine
    from services.live_trades_service import LiveTradesService

    dist_fit = getattr(strategy, "distribution_fit", None) or {}
    risk_config = getattr(strategy, "risk_config", None) or {}
    ci_confidence = 0.95
    min_trades_ci = 30
    max_bt_trades = 30

    # ── Extract BT PnL from equity curve ──
    trades_pnl = []
    equity_curve = getattr(strategy, "equity_curve", None) or []
    if equity_curve and len(equity_curve) > 1:
        for i in range(1, len(equity_curve)):
            prev = equity_curve[i-1].get("equity", 0) if isinstance(equity_curve[i-1], dict) else equity_curve[i-1]
            curr = equity_curve[i].get("equity", 0) if isinstance(equity_curve[i], dict) else equity_curve[i]
            trades_pnl.append(curr - prev)

    bt_ev = round(float(sum(trades_pnl) / len(trades_pnl)), 4) if trades_pnl else 0.0

    # ── Extract Live PnL ──
    live_trades_obj = LiveTradesService.get_live_trades(
        db,
        account_id=strategy.trading_account_id,
        magic_number=strategy.all_magic_numbers,
        start_date=strategy.start_date,
    )

    live_pnls = [t.profit for t in live_trades_obj]
    live_times = [t.close_time for t in live_trades_obj]

    # ── Append simulated PnL (sandbox, ephemeral) ──
    sim_pnls = sim_pnl_list or []
    if sim_pnls:
        last_t = live_times[-1] if live_times else datetime.now()
        for _ in sim_pnls:
            last_t += timedelta(hours=1)
            live_times.append(last_t)

    combined_live = live_pnls + sim_pnls
    live_trades_total = len(combined_live)
    live_ev = round(float(sum(combined_live) / len(combined_live)), 4) if combined_live else None

    cumulative_live = []
    run_eq = 0.0
    for p in combined_live:
        run_eq += p
        cumulative_live.append(round(run_eq, 2))

    # ── P(EV>0) evolution curve ──
    p_positive_curve = []
    if combined_live:
        engine = BayesEngine()
        step = max(1, len(combined_live) // 150)
        last_p = None
        for i in range(1, len(combined_live) + 1):
            if i == 1 or i == len(combined_live) or i % step == 0:
                tmp_decomp = engine.decompose_ev(
                    bt_pnl=trades_pnl if trades_pnl else None,
                    live_pnl=combined_live[:i],
                    confidence=ci_confidence,
                    min_trades=0,
                    max_bt_trades=max_bt_trades,
                    prior_stats_override=None
                )
                last_p = round(tmp_decomp.p_positive * 100, 1) if tmp_decomp else None
            p_positive_curve.append(last_p)

    # ── Historical Risk (Master Traffic Light) ──
    historical_risk = []
    if combined_live:
        from services.stats.historical_risk import HistoricalRiskAnalyzer

        bt_avg_pnl = sum(trades_pnl) / len(trades_pnl) if trades_pnl else sum(combined_live) / len(combined_live)
        bt_std_pnl = (sum((p - bt_avg_pnl) ** 2 for p in trades_pnl) / len(trades_pnl)) ** 0.5 if trades_pnl else 0
        bt_wr_val = sum(1 for p in trades_pnl if p > 0) / len(trades_pnl) if trades_pnl else 0.5

        hist_analyzer = HistoricalRiskAnalyzer(
            fits=dist_fit,
            bt_wr=bt_wr_val,
            bt_avg_pnl=bt_avg_pnl,
            bt_std_pnl=bt_std_pnl,
            limit_config=risk_config
        )
        # Use risk_config thresholds if available
        def_red_dd = risk_config.get("max_drawdown", {}).get("p_red", 95)
        def_amber_dd = risk_config.get("max_drawdown", {}).get("p_amber", 85)
        def_red_stag_d = risk_config.get("stagnation_days", {}).get("p_red", 101)
        def_amber_stag_d = risk_config.get("stagnation_days", {}).get("p_amber", 85)
        def_red_stag_t = risk_config.get("stagnation_trades", {}).get("p_red", 101)
        def_amber_stag_t = risk_config.get("stagnation_trades", {}).get("p_amber", 85)

        hist_analyzer.set_thresholds(
            def_red_dd, def_amber_dd,
            def_red_stag_d, def_amber_stag_d,
            def_red_stag_t, def_amber_stag_t,
            50, 80, 0.02, 0.10  # bayes/consist defaults
        )
        historical_risk = hist_analyzer.analyze_live_trades(combined_live, live_times, p_positive_curve)

    # ── Prior override (simulation-based strategies without equity curve) ──
    prior_override = None
    if not trades_pnl and strategy.metrics_snapshot and "SimulationParameters" in strategy.metrics_snapshot:
        sp = strategy.metrics_snapshot["SimulationParameters"]
        try:
            prior_override = {
                "n_trades": int(sp.get("n_trades", 0)),
                "win_rate": float(sp.get("win_rate", 0)),
                "avg_win": float(sp.get("avg_win", 0)),
                "std_win": float(sp.get("std_win", 0)),
                "avg_loss": float(sp.get("avg_loss", 0)),
                "std_loss": float(sp.get("std_loss", 0)),
            }
            if bt_ev == 0.0:
                bt_ev = round(
                    prior_override["win_rate"] * prior_override["avg_win"]
                    - (1 - prior_override["win_rate"]) * abs(prior_override["avg_loss"]),
                    4,
                )
        except (ValueError, TypeError):
            pass

    # ── Main Bayesian EV Decomposition ──
    engine = BayesEngine()
    decomposition = engine.decompose_ev(
        bt_pnl=trades_pnl if trades_pnl else None,
        live_pnl=combined_live if combined_live else None,
        confidence=ci_confidence,
        min_trades=min_trades_ci,
        prior_stats_override=prior_override,
        max_bt_trades=max_bt_trades,
    )

    # ── Fit types for chart display ──
    fit_types = {}
    for k, v in dist_fit.items():
        if v and v.get("is_hybrid"):
            hd = v.get("hybrid_data", {})
            fit_types[k] = {
                "type": "hybrid",
                "body": hd.get("body_label", ""),
                "tail": hd.get("tail_label", ""),
                "splice_pct": hd.get("splice_pct", 0),
            }
        elif v and v.get("passed"):
            fit_types[k] = {"type": "simple", "name": v.get("distribution_name", "")}
        else:
            fit_types[k] = {"type": "empirical"}

    # ── Risk Gauges ──
    risk_gauges = {}
    sim_overrides = {}
    if sim_pnls:
        import numpy as np
        pnl_arr = np.array(combined_live)
        cum_eq = np.cumsum(pnl_arr)

        peak = np.maximum.accumulate(cum_eq)
        drawdowns = peak - cum_eq
        sim_overrides["max_drawdown"] = float(np.max(drawdowns)) if len(drawdowns) > 0 else 0.0

        max_streak = streak = 0
        for p in pnl_arr:
            if p < 0:
                streak += 1
                max_streak = max(max_streak, streak)
            else:
                streak = 0
        sim_overrides["consecutive_losses"] = float(max_streak)

        max_stag = stag = 0
        eq_high = cum_eq[0]
        for eq in cum_eq:
            if eq > eq_high:
                eq_high = eq
                stag = 0
            else:
                stag += 1
                max_stag = max(max_stag, stag)
        sim_overrides["stagnation_trades"] = float(max_stag)

    for metric_name in ["max_drawdown", "daily_loss", "stagnation_days", "stagnation_trades", "consecutive_losses"]:
        fit_dict = dist_fit.get(metric_name)
        if metric_name in sim_overrides:
            current = sim_overrides[metric_name]
        else:
            cfg = risk_config.get(metric_name, {})
            current = cfg.get("current") if cfg else None

        if current is not None and fit_dict:
            from services.stats.gauge_evaluator import RiskGaugeEvaluator
            evaluator = RiskGaugeEvaluator(engine, risk_config)
            risk_gauges[metric_name] = evaluator.evaluate(
                metric_name=metric_name,
                current_value=current,
                fit_dict=fit_dict,
                is_simulated=metric_name in sim_overrides,
            )

    # ── Consistency Tests ──
    consistency_tests = {}
    if combined_live and (trades_pnl or prior_override):
        from scipy.stats import binom, norm
        import math

        live_wins = sum(1 for p in combined_live if p > 0)
        n_live = len(combined_live)
        if prior_override:
            bt_wr = prior_override["win_rate"]
        else:
            bt_wr = sum(1 for p in trades_pnl if p > 0) / len(trades_pnl) if trades_pnl else 0.5

        # Win Rate
        p_wr = float(binom.cdf(live_wins, n_live, bt_wr))
        live_wr_pct = round(live_wins / n_live * 100) if n_live > 0 else 0
        consistency_tests["win_rate"] = {
            "label": "Win Rate", "label_key": "winRate",
            "observed": f"{live_wr_pct}% ({live_wins}/{n_live})",
            "expected": f"{bt_wr * 100:.0f}%",
            "p_value": round(p_wr, 4),
            "status": "green" if p_wr > 0.10 else ("amber" if p_wr > 0.02 else "red"),
            "n": n_live, "k": live_wins, "bt_wr": round(bt_wr, 4),
        }

        # Consecutive Losses
        max_streak = streak = 0
        for p in combined_live:
            if p <= 0:
                streak += 1
                max_streak = max(max_streak, streak)
            else:
                streak = 0
        if max_streak > 0:
            p_raw = (1 - bt_wr) ** max_streak
            windows = max(1, n_live - max_streak + 1)
            p_streak = min(1.0, windows * p_raw)
            expected_streak = round(math.log(max(n_live, 2)) / math.log(1 / max(1 - bt_wr, 0.01)))
            consistency_tests["consec_losses"] = {
                "label": "Loss Streak", "label_key": "streak",
                "observed": str(max_streak), "expected": f"~{expected_streak}",
                "p_value": round(p_streak, 4),
                "status": "green" if p_streak > 0.10 else ("amber" if p_streak > 0.02 else "red"),
                "max_streak": max_streak, "loss_rate": round(1 - bt_wr, 4),
            }

        # PnL test
        if prior_override:
            bt_avg = bt_ev
            bt_std = prior_override.get("std_win", 0) * bt_wr + prior_override.get("std_loss", 0) * (1 - bt_wr)
        else:
            bt_avg = sum(trades_pnl) / len(trades_pnl)
            bt_std = (sum((p - bt_avg) ** 2 for p in trades_pnl) / len(trades_pnl)) ** 0.5
        live_avg = sum(combined_live) / n_live
        if bt_std > 0 and n_live > 0:
            se = bt_std / (n_live ** 0.5)
            z = (live_avg - bt_avg) / se
            p_pnl = float(norm.cdf(z))
            consistency_tests["avg_pnl"] = {
                "label": "Avg PnL", "label_key": "pnl",
                "observed": f"${live_avg:.1f}", "expected": f"${bt_avg:.1f}",
                "p_value": round(p_pnl, 4),
                "status": "green" if p_pnl > 0.10 else ("amber" if p_pnl > 0.02 else "red"),
                "z_score": round(z, 4),
            }

    # ── Info Report ──
    from services.risk_info_engine import RiskInfoEngine
    info_engine = RiskInfoEngine()
    p_pos = decomposition.p_positive if decomposition else None
    dd_pct = risk_gauges.get("drawdown", {}).get("percentile") if risk_gauges else None
    report = info_engine.analyze(
        p_positive=p_pos,
        consistency_tests=consistency_tests,
        dd_percentile=dd_pct,
        live_trades=live_trades_total,
    )
    info_report_dict = report.to_dict()

    # ── Final result dict ──
    return {
        "strategy_id": strategy.id,
        "total_trades": strategy.total_trades,
        "bt_ev": bt_ev,
        "bt_trades": len(trades_pnl) if not prior_override else prior_override["n_trades"],
        "live_ev": live_ev,
        "live_trades_total": live_trades_total,
        "decomposition": decomposition.to_dict() if decomposition else None,
        "risk_gauges": risk_gauges,
        "fit_types": fit_types,
        "consistency_tests": consistency_tests,
        "live_equity_curve": cumulative_live,
        "p_positive_curve": p_positive_curve,
        "historical_risk": historical_risk,
        "info_report": info_report_dict,
    }


def refresh_bayes_cache(strategy_id: str):
    """
    Background task: recompute and persist Bayesian cache for a strategy.
    Uses its own DB session (background tasks run outside request scope).
    """
    from models.database import SessionLocal

    db = SessionLocal()
    try:
        strategy = db.query(Strategy).filter(Strategy.id == strategy_id).first()
        if not strategy:
            logger.warning(f"[BayesCache] Strategy {strategy_id} not found, skipping")
            return

        logger.info(f"[BayesCache] Recomputing for '{strategy.name}' ({strategy_id})")
        result = compute_bayes_result(db, strategy)

        # Persist into metrics_snapshot["bayes_cache"]
        if strategy.metrics_snapshot is None:
            strategy.metrics_snapshot = {}

        strategy.metrics_snapshot["bayes_cache"] = result
        flag_modified(strategy, "metrics_snapshot")
        db.commit()
        logger.info(f"[BayesCache] Cached OK for '{strategy.name}' — P(EV>0)={result.get('decomposition', {}).get('p_positive', '?') if result.get('decomposition') else 'N/A'}")

    except Exception as e:
        logger.error(f"[BayesCache] Failed for {strategy_id}: {e}\n{traceback.format_exc()}")
        db.rollback()
    finally:
        db.close()


def invalidate_bayes_cache(db: Session, strategy: Strategy):
    """
    Clear the cached Bayesian result so it gets recomputed on next /bayes request.
    Call this when risk_config or equity_curve changes.
    """
    if strategy.metrics_snapshot and "bayes_cache" in strategy.metrics_snapshot:
        del strategy.metrics_snapshot["bayes_cache"]
        flag_modified(strategy, "metrics_snapshot")
        logger.info(f"[BayesCache] Invalidated cache for '{strategy.name}'")
