"""Strategies API routes — CRUD + CSV Upload."""

import json
import logging
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy.orm import Session
from typing import List

from models.database import get_db
from models.user import User
from schemas.strategy import StrategyResponse, StrategyListResponse, StrategyUpdate
from services.auth_service import get_current_user
from services.strategy_service import (
    create_strategy_from_csv, get_user_strategies,
    get_strategy_by_id, delete_strategy, update_strategy
)

logger = logging.getLogger("ironrisk")

router = APIRouter(prefix="/api/strategies", tags=["Strategies"])


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
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="File must be a CSV")

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


@router.get("/{strategy_id}/bayes")
def get_strategy_bayes(
    strategy_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
    # Override parameters for Sandbox testing
    override_prior: float = None,
    override_dd: float = None,
    override_daily_loss: float = None,
    override_stag_days: float = None,
    override_stag_trades: float = None,
    override_consec: float = None,
    use_hybrid: bool = True,
    max_posterior: float = 0.85,
    min_trades_ci: int = 30,
    ci_confidence: float = 0.95,
    disabled_metrics: str = "",
):
    """Returns Bayesian edge-survival evaluation for a strategy.
    
    Accepts optional override parameters for Sandbox testing.
    """
    from services.stats.fit_result import FitResult
    from services.stats.bayes_engine import BayesEngine
    
    strategy = get_strategy_by_id(db, strategy_id, user.id)
    dist_fit = getattr(strategy, "distribution_fit", None) or {}
    risk_config = getattr(strategy, "risk_config", None) or {}
    
    # Build FitResult objects for each metric
    fits: dict[str, FitResult] = {}
    for metric_name, fit_dict in dist_fit.items():
        if not fit_dict:
            continue
        # If use_hybrid is False and this is a hybrid fit, downgrade to empirical
        if not use_hybrid and fit_dict.get("is_hybrid"):
            fits[metric_name] = FitResult.empty(metric_name)
            continue
        fits[metric_name] = FitResult.from_dict(fit_dict)
    
    # Gather current live values from risk_config (heartbeat data)
    current_values: dict[str, float] = {}
    
    # Drawdown
    dd_val = override_dd
    if dd_val is None:
        dd_config = risk_config.get("max_drawdown", {})
        dd_val = dd_config.get("current")
    if dd_val is not None and "max_drawdown" in fits:
        current_values["max_drawdown"] = float(dd_val)
    
    # Daily loss
    dl_val = override_daily_loss
    if dl_val is None:
        dl_config = risk_config.get("daily_loss", {})
        dl_val = dl_config.get("current")
    if dl_val is not None and "daily_loss" in fits:
        current_values["daily_loss"] = float(dl_val)
    
    # Stagnation days
    stag_val = override_stag_days
    if stag_val is None:
        stag_config = risk_config.get("stagnation_days", {})
        stag_val = stag_config.get("current")
    if stag_val is not None and "stagnation_days" in fits:
        current_values["stagnation_days"] = float(stag_val)
    
    # Stagnation trades
    stag_trades_val = override_stag_trades
    if stag_trades_val is None:
        stag_trades_config = risk_config.get("stagnation_trades", {})
        stag_trades_val = stag_trades_config.get("current")
    if stag_trades_val is not None and "stagnation_trades" in fits:
        current_values["stagnation_trades"] = float(stag_trades_val)
    
    # Consecutive losses
    consec_val = override_consec
    if consec_val is None:
        consec_config = risk_config.get("consecutive_losses", {})
        consec_val = consec_config.get("current")
    if consec_val is not None and "consecutive_losses" in fits:
        current_values["consecutive_losses"] = float(consec_val)
    
    # Remove disabled metrics from evidence
    if disabled_metrics:
        for m in disabled_metrics.split(","):
            m = m.strip()
            current_values.pop(m, None)
    
    # Prior (from strategy metadata or override)
    prior = override_prior if override_prior is not None else 0.5
    hwm_recoveries = 0  # TODO: persist and track HWM recovery cycles
    
    # Trades PnL for credibility interval — extracted from BACKTEST equity curve
    # Each point is {"trade": N, "equity": cumulative_pnl, "date": "..."}
    trades_pnl = []
    equity_curve = getattr(strategy, "equity_curve", None) or []
    if equity_curve and len(equity_curve) > 1:
        for i in range(1, len(equity_curve)):
            prev = equity_curve[i-1].get("equity", 0) if isinstance(equity_curve[i-1], dict) else equity_curve[i-1]
            curr = equity_curve[i].get("equity", 0) if isinstance(equity_curve[i], dict) else equity_curve[i]
            trades_pnl.append(curr - prev)
    
    # Compute backtest EV from trades_pnl
    bt_ev = round(float(sum(trades_pnl) / len(trades_pnl)), 4) if trades_pnl else 0.0
    
    # Count live trades (from RealTrade table)
    from models.real_trade import RealTrade
    live_trades_query = db.query(RealTrade).filter(
        RealTrade.trading_account_id == strategy.trading_account_id,
        RealTrade.magic_number == strategy.magic_number,
    ).all()
    
    live_trades_total = len(live_trades_query)
    
    # Split live trades into pre-HWM (Phase B) and post-HWM (Phase C)
    # HWM = High Water Mark = max cumulative equity in live
    live_pnls = [t.profit for t in live_trades_query]
    live_pre_hwm = 0
    live_post_hwm = 0
    if live_pnls:
        cum_equity = 0.0
        hwm = 0.0
        for pnl in live_pnls:
            cum_equity += pnl
            if cum_equity > hwm:
                hwm = cum_equity
                live_post_hwm += 1  # This trade set a new HWM
            else:
                live_pre_hwm += 1   # Below HWM = suffering phase
    
    # Combine BT + ALL live PnLs for main CI
    all_pnl = list(trades_pnl)  # BT trades
    if live_pnls:
        all_pnl.extend(live_pnls)  # + all live trades
    
    engine = BayesEngine()
    result = engine.evaluate(
        fits=fits,
        current_values=current_values,
        prior=prior,
        hwm_recoveries=hwm_recoveries,
        trades_pnl=all_pnl if all_pnl else None,
        max_posterior=max_posterior,
        min_trades_ci=min_trades_ci,
        ci_confidence=ci_confidence,
    )
    
    # Compute SEPARATE live-only CI (the one that actually matters for real monitoring)
    ci_live = engine.compute_credibility_interval(
        live_pnls, confidence=ci_confidence, min_trades=min_trades_ci
    ) if live_pnls else None
    
    # Live EV
    live_ev = round(float(sum(live_pnls) / len(live_pnls)), 4) if live_pnls else None
    
    # Also return which fits are hybrid for frontend display
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
    
    # Build disabled list for frontend
    disabled_list = [m.strip() for m in disabled_metrics.split(",") if m.strip()] if disabled_metrics else []
    
    return {
        **result.to_dict(),
        "fit_types": fit_types,
        "strategy_id": strategy_id,
        "total_trades": strategy.total_trades,
        "bt_ev": bt_ev,
        "bt_trades": len(trades_pnl),
        "live_ev": live_ev,
        "live_trades_total": live_trades_total,
        "live_pre_hwm": live_pre_hwm,
        "live_post_hwm": live_post_hwm,
        "ci_live": ci_live,
        "disabled_metrics": disabled_list,
    }
