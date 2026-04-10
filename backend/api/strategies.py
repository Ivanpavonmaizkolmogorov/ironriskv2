"""Strategies API routes — CRUD + CSV Upload."""

import json
import logging
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy.orm import Session
from typing import List

from models.database import get_db
from models.user import User
from schemas.strategy import StrategyResponse, StrategyListResponse, StrategyUpdate, CreateFromSimulationRequest, LiveTradeResponse
from services.auth_service import get_current_user
from services.strategy_service import (
    create_strategy_from_csv, create_strategy_from_simulation,
    get_user_strategies, get_strategy_by_id, delete_strategy, update_strategy,
    apply_risk_multiplier,
)

logger = logging.getLogger("ironrisk")

router = APIRouter(prefix="/api/strategies", tags=["Strategies"])


@router.post("/create-from-simulation", response_model=StrategyResponse)
def create_from_simulation(
    req: CreateFromSimulationRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Create a strategy from simulator data with full backtest context."""
    try:
        strategy = create_strategy_from_simulation(
            db=db,
            trading_account_id=req.trading_account_id,
            name=req.name,
            magic_number=req.magic_number,
            risk_config=req.risk_config,
            decomposition=req.decomposition,
            risk_suggestions=req.risk_suggestions,
            extracted_stats=req.extracted_stats,
            equity_curve=req.equity_curve,
            start_date=req.start_date,
            bt_discount=req.bt_discount or 10.0,
        )
        return strategy
    except Exception as e:
        logger.error(f"create-from-simulation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/upload", response_model=StrategyResponse)
async def upload_strategy(
    trading_account_id: str = Form(...),
    name: str = Form(...),
    description: str = Form(""),
    magic_number: int = Form(0),
    start_date: str = Form(None),
    max_drawdown_limit: float = Form(0.0),
    daily_loss_limit: float = Form(0.0),
    column_mapping: str = Form(None),
    skip_recalc: bool = Form(False),
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Upload a CSV file to create a new strategy with full metrics analysis."""
    allowed_ext = (".csv", ".html", ".htm", ".xls", ".xlsx")
    if not file.filename or not file.filename.lower().endswith(allowed_ext):
        raise HTTPException(status_code=400, detail=f"File must be one of: {', '.join(allowed_ext)}")

    content = await file.read()
    if len(content) == 0:
        raise HTTPException(status_code=400, detail="CSV file is empty")

    # Parse column mapping from JSON string
    mapping = None
    if column_mapping:
        try:
            mapping = json.loads(column_mapping)
            logger.info(f"Column mapping received: {mapping}")
        except json.JSONDecodeError:
            raise HTTPException(status_code=400, detail="Invalid column_mapping JSON")

    try:
        strategy = create_strategy_from_csv(
            db=db,
            trading_account_id=trading_account_id,
            name=name,
            description=description,
            magic_number=magic_number,
            start_date=start_date,
            max_drawdown_limit=max_drawdown_limit,
            daily_loss_limit=daily_loss_limit,
            csv_content=content,
            filename=file.filename or "upload.csv",
            column_mapping=mapping,
            skip_recalc=skip_recalc,
        )
        return strategy
    except ValueError as e:
        logger.warning(f"CSV parsing error for user {user.id}: {e}")
        raise HTTPException(status_code=400, detail=f"CSV error: {str(e)}")
    except Exception as e:
        logger.error(f"Upload failed for user {user.id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Strategy creation failed: {str(e)}")


@router.get("/", response_model=List[StrategyResponse])
def list_strategies(
    trading_account_id: str = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return get_user_strategies(db, user.id, trading_account_id)


@router.get("/{strategy_id}", response_model=StrategyResponse)
def get_strategy(
    strategy_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return get_strategy_by_id(db, strategy_id, user.id)


@router.delete("/{strategy_id}")
def remove_strategy(
    strategy_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    delete_strategy(db, strategy_id, user.id)
    return {"detail": "Strategy deleted"}


@router.delete("/bulk/all")
def remove_all_strategies(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete ALL strategies belonging to the current user."""
    from services.strategy_service import get_user_strategies, delete_strategies_bulk
    strategies = get_user_strategies(db, user.id)
    strategy_ids = [s.id for s in strategies]
    count = delete_strategies_bulk(db, strategy_ids, user.id)
    logger.info(f"Bulk deleted {count} strategies for user {user.id}")
    return {"detail": f"{count} strategies deleted"}


from pydantic import BaseModel

class BulkDeleteRequest(BaseModel):
    strategy_ids: list[str]

@router.delete("/bulk/delete")
def bulk_delete_strategies_endpoint(
    request: BulkDeleteRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Delete specific strategies efficiently in bulk."""
    from services.strategy_service import delete_strategies_bulk
    count = delete_strategies_bulk(db, request.strategy_ids, user.id)
    logger.info(f"Bulk deleted {count} specific strategies for user {user.id}")
    return {"detail": f"{count} strategies deleted"}


@router.patch("/{strategy_id}", response_model=StrategyResponse)
def modify_strategy(
    strategy_id: str,
    update_data: StrategyUpdate,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update strategy parameters like name, description, magic number."""
    return update_strategy(db, strategy_id, user.id, update_data)


@router.get("/{strategy_id}/trades", response_model=List[LiveTradeResponse])
def get_strategy_trades(
    strategy_id: str,
    limit: int = 50,
    offset: int = 0,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Returns paginated trades for a specific strategy."""
    from models.strategy import Strategy
    from models.real_trade import RealTrade
    from fastapi import HTTPException
    from services.strategy_service import get_strategy_by_id
    
    st = get_strategy_by_id(db, strategy_id, user.id)
        
    query = db.query(RealTrade).filter(RealTrade.magic_number.in_(st.all_magic_numbers))
    
    if st.start_date:
        from datetime import datetime, timezone
        from dateutil import parser
        try:
            start_date_filter = parser.parse(st.start_date)
            if start_date_filter.tzinfo is None:
                start_date_filter = start_date_filter.replace(tzinfo=timezone.utc)
            query = query.filter(RealTrade.close_time >= start_date_filter)
        except Exception:
            pass
            
    # Ordered by closest first (descending)
    query = query.order_by(RealTrade.close_time.desc())
    
    # If limit is 0 or very large, we can return "Load all". Limit defaults to 50.
    if limit > 0:
        query = query.offset(offset).limit(limit)
        
    trades = query.all()
    return trades


@router.get("/{strategy_id}/chart/{metric_name}")
def get_strategy_chart(
    strategy_id: str,
    metric_name: str,
    value: float = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Returns a BMP image plotting the current value against its historical distribution."""
    from fastapi.responses import Response
    from services.stats.chart_renderer import render_metric_chart
    from services.stats.fit_result import FitResult
    
    strategy = get_strategy_by_id(db, strategy_id, user.id)
    
    if not getattr(strategy, "distribution_fit", None):
        fit = FitResult.empty(metric_name)
    else:
        fit_dict = strategy.distribution_fit.get(metric_name)
        if fit_dict and (fit_dict.get("passed") or fit_dict.get("distribution_name") == "empirical"):
            fit = FitResult.from_dict(fit_dict)
        else:
            fit = FitResult.empty(metric_name)
            
    bmp_bytes = render_metric_chart(fit, current_val=value, width=420, height=260)
    
    return Response(content=bmp_bytes, media_type="image/bmp")


@router.get("/{strategy_id}/chart-data/{metric_name}")
def get_strategy_chart_data(
    strategy_id: str,
    metric_name: str,
    value: float = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Returns raw JSON data arrays for the statistical distribution for a Strategy."""
    from services.stats.fit_result import FitResult
    import numpy as np
    
    strategy = get_strategy_by_id(db, strategy_id, user.id)
    
    if not getattr(strategy, "distribution_fit", None):
        fit_dict = None
        fit = FitResult.empty(metric_name)
    else:
        fit_dict = strategy.distribution_fit.get(metric_name)
        if fit_dict and (fit_dict.get("passed") or fit_dict.get("distribution_name") == "empirical"):
            fit = FitResult.from_dict(fit_dict)
        else:
            fit = FitResult.empty(metric_name)
            
    response_data = {
        "metric_name": metric_name,
        "distribution_name": fit.distribution_name,
        "passed": fit.passed,
        "parameters": fit.get_mapped_params(),
        "histogram": [],
        "curve": [],
        "current_value": value
    }

    if value is not None:
        response_data["current_percentile"] = int(fit.percentile(value))

    if fit.empirical_percentiles:
        perc_vals = np.array(fit.empirical_percentiles)
        
        data_range = perc_vals[-1] - perc_vals[0]
        if data_range > 0:
            n_bins = min(30, max(10, int(np.sqrt(len(perc_vals)))))
            hist, bin_edges = np.histogram(perc_vals, bins=n_bins, density=True)
            for i in range(len(hist)):
                response_data["histogram"].append({
                    "x0": float(bin_edges[i]),
                    "x1": float(bin_edges[i+1]),
                    "height": float(hist[i])
                })

    if fit.passed and fit.distribution_name not in ("empirical", "none"):
        start = fit.ppf(0.001)
        end = fit.ppf(0.999)
        span = end - start
        x = np.linspace(start - 0.05*span, end + 0.05*span, 300)
        y = fit.pdf(x)
        for val_x, val_y in zip(x, y):
            response_data["curve"].append({
                "x": float(val_x),
                "y": float(val_y)
            })

    # Indicate hybrid status to frontend for legend rendering
    if fit_dict and fit_dict.get("is_hybrid"):
        response_data["is_hybrid"] = True
        hd = fit_dict.get("hybrid_data", {})
        response_data["hybrid_info"] = {
            "body_label": hd.get("body_label", ""),
            "tail_label": hd.get("tail_label", ""),
            "splice_percentile": hd.get("splice_percentile", 90),
            "splice_value": hd.get("splice_value", 0),
        }

    return response_data


class ApplyMultiplierRequest(BaseModel):
    risk_multiplier: float

@router.post("/{strategy_id}/apply-multiplier", response_model=StrategyResponse)
def apply_multiplier_endpoint(
    strategy_id: str,
    req: ApplyMultiplierRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Apply a risk multiplier to scale all backtest PnL and re-run analysis."""
    return apply_risk_multiplier(db, strategy_id, user.id, req.risk_multiplier)


@router.get("/{strategy_id}/bayes")
def get_strategy_bayes(
    strategy_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    # Sandbox-configurable parameters
    min_trades_ci: int = 30,
    ci_confidence: float = 0.95,
    bt_discount: float = 20.0,  # Internal constant — no longer user-configurable
    sim_pnl: str = "",  # Comma-separated simulated PnL, e.g. "50,-30,40"
    max_bt_trades: int = 30, # Max effective backtest trades cap (universal default)
    
    # Thresholds
    thresh_red_dd: int = 95,
    thresh_amber_dd: int = 85,
    thresh_red_stag_d: int = 101,
    thresh_amber_stag_d: int = 85,
    thresh_red_stag_t: int = 101,
    thresh_amber_stag_t: int = 85,
    
    thresh_red_bayes: int = 50,
    thresh_amber_bayes: int = 80,
    thresh_red_consist: float = 0.02,
    thresh_amber_consist: float = 0.10,
):
    """Returns Bayesian EV decomposition for a strategy.
    
    Uses Beta(WinRate) + NIG(AvgWin) + NIG(AvgLoss) + Delta Method.
    BT trades = prior, Live trades = data.
    """
    from services.stats.fit_result import FitResult
    from services.stats.bayes_engine import BayesEngine
    
    strategy = get_strategy_by_id(db, strategy_id, user.id)
    
    # bt_discount is now a fixed internal constant (20.0), not user-configurable
    dist_fit = getattr(strategy, "distribution_fit", None) or {}
    risk_config = getattr(strategy, "risk_config", None) or {}
    
    # Extract BT PnL from equity curve
    trades_pnl = []
    equity_curve = getattr(strategy, "equity_curve", None) or []
    if equity_curve and len(equity_curve) > 1:
        for i in range(1, len(equity_curve)):
            prev = equity_curve[i-1].get("equity", 0) if isinstance(equity_curve[i-1], dict) else equity_curve[i-1]
            curr = equity_curve[i].get("equity", 0) if isinstance(equity_curve[i], dict) else equity_curve[i]
            trades_pnl.append(curr - prev)
    
    bt_ev = round(float(sum(trades_pnl) / len(trades_pnl)), 4) if trades_pnl else 0.0
    
    # Extract live PnL from RealTrade table — uses shared service for BT/Live separation
    from services.live_trades_service import LiveTradesService
    from datetime import timedelta, datetime
    
    live_trades_obj = LiveTradesService.get_live_trades(
        db,
        account_id=strategy.trading_account_id,
        magic_number=strategy.all_magic_numbers,
        start_date=strategy.start_date,
    )
    
    live_pnls = [t.profit for t in live_trades_obj]
    live_times = [t.close_time for t in live_trades_obj]
    
    # Append simulated PnL (ephemeral, never saved)
    sim_pnls = []
    if sim_pnl and sim_pnl.strip():
        import re
        tokens = re.split(r'[,;\s]+', sim_pnl.strip())
        last_t = live_times[-1] if live_times else datetime.now()
        for tok in tokens:
            tok = tok.strip()
            if not tok:
                continue
            try:
                sim_pnls.append(float(tok))
                last_t += timedelta(hours=1)
                live_times.append(last_t)
            except ValueError:
                pass
    
    combined_live = live_pnls + sim_pnls
    live_trades_total = len(combined_live)
    live_ev = round(float(sum(combined_live) / len(combined_live)), 4) if combined_live else None
    
    cumulative_live = []
    run_eq = 0.0
    for p in combined_live:
        run_eq += p
        cumulative_live.append(round(run_eq, 2))

    # Calculate evolution of P(EV>0)
    p_positive_curve = []
    if combined_live:
        engine = BayesEngine()
        step = max(1, len(combined_live) // 150) # max 150 points
        last_p = None
        for i in range(1, len(combined_live) + 1):
            if i == 1 or i == len(combined_live) or i % step == 0:
                tmp_decomp = engine.decompose_ev(
                    bt_pnl=trades_pnl if trades_pnl else None,
                    live_pnl=combined_live[:i],
                    bt_discount=bt_discount,
                    confidence=ci_confidence,
                    min_trades=0,
                    max_bt_trades=max_bt_trades if max_bt_trades > 0 else 30,
                    prior_stats_override=None
                )
                last_p = round(tmp_decomp.p_positive * 100, 1) if tmp_decomp else None
            p_positive_curve.append(last_p)

    # Calculate historical risk (Master Traffic Light and consistency evolution)
    historical_risk = []
    if combined_live:
        from services.stats.historical_risk import HistoricalRiskAnalyzer
        
        bt_avg_pnl = sum(trades_pnl)/len(trades_pnl) if trades_pnl else sum(combined_live)/len(combined_live)
        bt_std_pnl = (sum((p-bt_avg_pnl)**2 for p in trades_pnl)/len(trades_pnl))**0.5 if trades_pnl else 0
        bt_wr_val = sum(1 for p in trades_pnl if p > 0)/len(trades_pnl) if trades_pnl else 0.5
        
        hist_analyzer = HistoricalRiskAnalyzer(
            fits=dist_fit,
            bt_wr=bt_wr_val,
            bt_avg_pnl=bt_avg_pnl,
            bt_std_pnl=bt_std_pnl,
            limit_config=risk_config
        )
        # Override query param thresholds with user-defined risk_config if available
        def_red_dd = risk_config.get("max_drawdown", {}).get("p_red", thresh_red_dd)
        def_amber_dd = risk_config.get("max_drawdown", {}).get("p_amber", thresh_amber_dd)
        def_red_stag_d = risk_config.get("stagnation_days", {}).get("p_red", thresh_red_stag_d)
        def_amber_stag_d = risk_config.get("stagnation_days", {}).get("p_amber", thresh_amber_stag_d)
        def_red_stag_t = risk_config.get("stagnation_trades", {}).get("p_red", thresh_red_stag_t)
        def_amber_stag_t = risk_config.get("stagnation_trades", {}).get("p_amber", thresh_amber_stag_t)
        
        hist_analyzer.set_thresholds(
            def_red_dd, def_amber_dd, 
            def_red_stag_d, def_amber_stag_d,
            def_red_stag_t, def_amber_stag_t,
            thresh_red_bayes, thresh_amber_bayes, 
            thresh_red_consist, thresh_amber_consist
        )
        historical_risk = hist_analyzer.analyze_live_trades(combined_live, live_times, p_positive_curve)
    
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
                bt_ev = round(prior_override["win_rate"] * prior_override["avg_win"] - (1 - prior_override["win_rate"]) * abs(prior_override["avg_loss"]), 4)
        except (ValueError, TypeError):
            pass

    # Bayesian EV Decomposition: Beta + NIG + Delta
    engine = BayesEngine()
    decomposition = engine.decompose_ev(
        bt_pnl=trades_pnl if trades_pnl else None,
        live_pnl=combined_live if combined_live else None,
        bt_discount=bt_discount,
        confidence=ci_confidence,
        min_trades=min_trades_ci,
        prior_stats_override=prior_override,
        max_bt_trades=max_bt_trades if max_bt_trades > 0 else 30,
    )
    
    # Build fit types for chart display
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
    
    # Compute current KPI percentiles for risk gauges
    # If sim data present, recompute metrics from combined PnL sequence
    risk_gauges = {}
    
    sim_overrides = {}
    if sim_pnls:
        # Recompute risk metrics from the combined PnL sequence (live + sim if present)
        import numpy as np
        pnl_arr = np.array(combined_live)
        cum_eq = np.cumsum(pnl_arr)
        
        # Max Drawdown: peak-to-trough in cumulative equity
        peak = np.maximum.accumulate(cum_eq)
        drawdowns = peak - cum_eq
        sim_overrides["max_drawdown"] = float(np.max(drawdowns)) if len(drawdowns) > 0 else 0.0
        
        # Consecutive Losses: max streak of negative PnL
        max_streak = 0
        streak = 0
        for p in pnl_arr:
            if p < 0:
                streak += 1
                max_streak = max(max_streak, streak)
            else:
                streak = 0
        sim_overrides["consecutive_losses"] = float(max_streak)
        
        # Stagnation (trades): max trades without new equity high
        max_stag = 0
        stag = 0
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
        
        # Use sim override if available, else real current from heartbeat
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
                is_simulated=metric_name in sim_overrides
            )
    # --- Consistency Tests: BT ↔ Live ---
    consistency_tests = {}
    if combined_live and (trades_pnl or prior_override):
        from scipy.stats import binom, norm
        
        live_wins = sum(1 for p in combined_live if p > 0)
        live_losses = sum(1 for p in combined_live if p <= 0)
        n_live = len(combined_live)
        if prior_override:
            bt_wr = prior_override["win_rate"]
        else:
            bt_wr = sum(1 for p in trades_pnl if p > 0) / len(trades_pnl) if trades_pnl else 0.5
        
        # 1. Win Rate: P(seeing ≤ k wins | BT WR)
        p_wr = float(binom.cdf(live_wins, n_live, bt_wr))
        live_wr_pct = round(live_wins / n_live * 100) if n_live > 0 else 0
        consistency_tests["win_rate"] = {
            "label": "Win Rate",
            "label_key": "winRate",
            "observed": f"{live_wr_pct}% ({live_wins}/{n_live})",
            "expected": f"{bt_wr*100:.0f}%",
            "p_value": round(p_wr, 4),
            "status": "green" if p_wr > 0.10 else ("amber" if p_wr > 0.02 else "red"),
            "n": n_live,
            "k": live_wins,
            "bt_wr": round(bt_wr, 4),
        }
        
        # 2. Consecutive Losses: P(streak ≥ k | WR)
        max_streak = 0
        streak = 0
        for p in combined_live:
            if p <= 0:
                streak += 1
                max_streak = max(max_streak, streak)
            else:
                streak = 0
        if max_streak > 0:
            # P(k consecutive losses somewhere in n trades) ≈ min(1, (n-k+1) × (1-wr)^k)
            p_raw = (1 - bt_wr) ** max_streak
            windows = max(1, n_live - max_streak + 1)
            p_streak = min(1.0, windows * p_raw)
            # Expected max streak ≈ log(n) / log(1/(1-wr))
            import math
            expected_streak = round(math.log(max(n_live, 2)) / math.log(1 / max(1 - bt_wr, 0.01)))
            consistency_tests["consec_losses"] = {
                "label": "Loss Streak",
                "label_key": "streak",
                "observed": str(max_streak),
                "expected": f"~{expected_streak}",
                "p_value": round(p_streak, 4),
                "status": "green" if p_streak > 0.10 else ("amber" if p_streak > 0.02 else "red"),
                "max_streak": max_streak,
                "loss_rate": round(1 - bt_wr, 4),
            }
        
        # 3. PnL medio: ¿el PnL/trade live es consistente con el EV del BT?
        if prior_override:
            bt_avg = bt_ev
            bt_std = prior_override.get("std_win", 0) * bt_wr + prior_override.get("std_loss", 0) * (1 - bt_wr)  # Approximation
        else:
            bt_avg = sum(trades_pnl) / len(trades_pnl)
            bt_std = (sum((p - bt_avg)**2 for p in trades_pnl) / len(trades_pnl)) ** 0.5
        live_avg = sum(combined_live) / n_live
        if bt_std > 0 and n_live > 0:
            # z-score: how many σ away is the live avg from BT avg?
            se = bt_std / (n_live ** 0.5)
            z = (live_avg - bt_avg) / se
            p_pnl = float(norm.cdf(z))  # one-sided: P(seeing avg ≤ observed)
            consistency_tests["avg_pnl"] = {
                "label": "Avg PnL",
                "label_key": "pnl",
                "observed": f"${live_avg:.1f}",
                "expected": f"${bt_avg:.1f}",
                "p_value": round(p_pnl, 4),
                "status": "green" if p_pnl > 0.10 else ("amber" if p_pnl > 0.02 else "red"),
                "z_score": round(z, 4),
            }
    
    info_report_dict = _build_info_report(
        decomposition=decomposition,
        consistency_tests=consistency_tests,
        risk_gauges=risk_gauges,
        live_trades=live_trades_total,
    )

    # Persist the output so the live heartbeat EA can fetch the cached identical reasons
    if strategy.metrics_snapshot is None:
        strategy.metrics_snapshot = {}
    
    strategy.metrics_snapshot["bayes_cache"] = {
        "info_report": info_report_dict,
        "p_positive": decomposition.p_positive if decomposition else 0.0,
    }
    from sqlalchemy.orm.attributes import flag_modified
    flag_modified(strategy, "metrics_snapshot")
    db.commit()

    return {
        "strategy_id": strategy_id,
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


def _build_info_report(decomposition, consistency_tests, risk_gauges, live_trades):
    from services.risk_info_engine import RiskInfoEngine
    engine = RiskInfoEngine()

    p_pos = decomposition.p_positive if decomposition else None
    dd_pct = risk_gauges.get("drawdown", {}).get("percentile") if risk_gauges else None

    report = engine.analyze(
        p_positive=p_pos,
        consistency_tests=consistency_tests,
        dd_percentile=dd_pct,
        live_trades=live_trades,
    )
    return report.to_dict()

