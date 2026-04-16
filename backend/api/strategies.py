"""Strategies API routes — CRUD + CSV Upload."""

import json
import logging
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException
from sqlalchemy.orm import Session
from typing import List

from models.database import get_db
from models.user import User
from schemas.strategy import (
    StrategyResponse, StrategyListResponse, StrategyUpdate, 
    CreateFromSimulationRequest, LiveTradeResponse, SQXImportRequest
)
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


from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
security = HTTPBearer()

@router.post("/sqx-import", response_model=StrategyResponse)
def sqx_import(
    req: SQXImportRequest,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
):
    """Direct import of a strategy from StrategyQuant X JSON payload."""
    from services.portfolio_service import ensure_sqx_inbox_portfolio, remove_strategy_from_portfolios, recalculate_portfolio
    from services.trading_account_service import validate_api_token
    from models.trading_account import TradingAccount
    
    # Extract token from the Bearer header
    api_token = credentials.credentials
    
    # 1. Find user's trading account using the provided api_token
    account = validate_api_token(db, api_token)
    trading_acct_id = account.id
    
    # 2. Build the equity curve
    equity_curve = []
    cum_equity = 0.0
    
    sorted_trades = sorted(req.trades, key=lambda t: t.close_time)
    
    for i, t in enumerate(sorted_trades):
        cum_equity += t.profit
        equity_curve.append({
            "trade": i + 1,
            "equity": round(cum_equity, 2),
            "date": t.close_time,
            "pnl": t.profit
        })
        
    start_date = sorted_trades[0].open_time if sorted_trades else None
    
    # 3. Call create_strategy_from_simulation
    strategy = create_strategy_from_simulation(
        db=db,
        trading_account_id=trading_acct_id,
        name=req.name,
        magic_number=req.magic_number,
        equity_curve=equity_curve,
        start_date=start_date,
        risk_config={"max_drawdown": {"enabled": True, "limit": req.max_drawdown_limit}} if req.max_drawdown_limit > 0 else None,
        bt_discount=10.0
    )
    
    # 4. Move to SQX sandbox ONLY (remove from auto-included default workspace)
    remove_strategy_from_portfolios(db, strategy.id, trading_acct_id)
    
    sandbox = ensure_sqx_inbox_portfolio(db, trading_acct_id)
    ids = list(sandbox.strategy_ids or [])
    if strategy.id not in ids:
        ids.append(strategy.id)
        sandbox.strategy_ids = ids
        db.commit()
        recalculate_portfolio(db, sandbox)
        
    logger.info(f"Imported SQX strategy '{strategy.name}' into Sandbox")
    return strategy


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
    
    try:
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
    except Exception as e:
        # Return empty 204 instead of crashing with 500
        return Response(status_code=204)


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
    # Sandbox-only: simulated PnL (ephemeral, bypasses cache)
    sim_pnl: str = "",
):
    """Returns Bayesian EV decomposition for a strategy.
    
    Cache-first: reads from metrics_snapshot["bayes_cache"] if available.
    Falls back to on-the-fly computation only when:
      - Cache is missing (first load)
      - sim_pnl is provided (sandbox mode)
    """
    import logging, traceback, re
    logger = logging.getLogger("ironrisk.bayes")

    try:
        from services.bayes_cache_service import compute_bayes_result

        strategy = get_strategy_by_id(db, strategy_id, user.id)

        # ── Sandbox mode: sim_pnl provided → always compute fresh ──
        sim_pnls = []
        if sim_pnl and sim_pnl.strip():
            tokens = re.split(r'[,;\s]+', sim_pnl.strip())
            for tok in tokens:
                tok = tok.strip()
                if tok:
                    try:
                        sim_pnls.append(float(tok))
                    except ValueError:
                        pass

        if sim_pnls:
            # Sandbox: compute on-the-fly with simulated PnL (never cached)
            result = compute_bayes_result(db, strategy, sim_pnl_list=sim_pnls)
            return result

        # ── Cache-first: try to read pre-computed result ──
        cached = (strategy.metrics_snapshot or {}).get("bayes_cache")
        if cached and "decomposition" in cached:
            # Validate it's the NEW full format (not the old {info_report, p_positive} stub)
            logger.debug(f"[BayesCache] HIT for {strategy.name}")
            return cached

        # ── Cache MISS: compute on-the-fly and persist ──
        logger.info(f"[BayesCache] MISS for '{strategy.name}' — computing on-the-fly")
        result = compute_bayes_result(db, strategy)

        # Persist for next time
        if strategy.metrics_snapshot is None:
            strategy.metrics_snapshot = {}
        strategy.metrics_snapshot["bayes_cache"] = result
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(strategy, "metrics_snapshot")
        db.commit()

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Bayes computation failed for strategy {strategy_id}: {e}\n{traceback.format_exc()}")
        return {
            "strategy_id": strategy_id,
            "total_trades": 0, "bt_ev": 0, "bt_trades": 0,
            "live_ev": None, "live_trades_total": 0,
            "decomposition": None, "risk_gauges": {},
            "fit_types": {}, "consistency_tests": {},
            "live_equity_curve": [], "p_positive_curve": [],
            "historical_risk": [], "info_report": {},
            "_error": str(e),
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

