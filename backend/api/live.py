"""Live API routes — EA heartbeat endpoint (API Token auth, no JWT)."""

from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from models.database import get_db
from schemas.live import HeartbeatRequest, HeartbeatResponse
from services.trading_account_service import validate_api_token
from services.strategy_service import get_strategy_by_magic
from services.portfolio_service import get_default_portfolio, ensure_default_portfolio
from services.stats.risk_profile import RiskProfile
from core.risk_engine import RiskEngine
from schemas.live import SyncTradesPayload, SyncTradeRequest
from dateutil import parser as dateparser
from models.real_trade import RealTrade
from models.strategy import Strategy
from services.layout_service import DashboardLayoutService
from fastapi import HTTPException
from services.orphan_service import OrphanService

router = APIRouter(prefix="/api/live", tags=["Live EA"])


def compute_current_values(db: Session, account_id: str, magic_number: int, req: HeartbeatRequest) -> dict:
    """Compute current values for risk variables using RealTrade as Source of Truth."""
    result = {
        "max_drawdown": round(req.current_drawdown, 2),
        "daily_loss": 0.0,
        "consecutive_losses": 0,
        "stagnation_days": 0,
        "stagnation_trades": 0,
        "net_profit": 0.0,
        "total_trades": 0,
    }

    query = db.query(RealTrade).filter(RealTrade.trading_account_id == account_id)
    if magic_number != 0:
        query = query.filter(RealTrade.magic_number == magic_number)
        
    trades = query.order_by(RealTrade.close_time.asc()).all()
    if not trades:
        return result
        
    equity = 0.0
    peak = 0.0
    consec = 0
    stag_trades = 0
    last_peak_time = None
    first_trade_time = trades[0].close_time  # Always exists (checked above)
    
    today = datetime.now(timezone.utc).date()
    daily_closed_loss = 0.0
    
    for t in trades:
        equity += t.profit
        
        # Consec losses
        if t.profit < 0:
            consec += 1
            if t.close_time.date() == today:
                daily_closed_loss += abs(t.profit)
        else:
            consec = 0
            
        # Stagnation
        if equity >= peak:
            peak = equity
            stag_trades = 0
            last_peak_time = t.close_time
        else:
            stag_trades += 1
            
    result["consecutive_losses"] = consec
    result["stagnation_trades"] = stag_trades
    result["daily_loss"] = round(daily_closed_loss, 2)
    result["net_profit"] = round(equity, 2)
    result["total_trades"] = len(trades)
    
    # Stagnation days: use last peak time, or first trade time if equity never recovered
    ref_time = last_peak_time if last_peak_time else first_trade_time
    delta = (datetime.now(timezone.utc).date() - ref_time.date()).days
    result["stagnation_days"] = max(delta, 0)
        
    return result


def enrich_risk_config(risk_config: dict, current_values: dict, master_toggles: dict = None) -> dict:
    """Inject 'current' values and master toggle states into risk_config."""
    if not risk_config:
        risk_config = {}
    enriched = {}
    for key, cfg in risk_config.items():
        if isinstance(cfg, dict):
            new_cfg = {**cfg, "current": current_values.get(key, 0)}
            if master_toggles is not None:
                new_cfg["enabled"] = master_toggles.get(key, False)
            enriched[key] = new_cfg
        else:
            enriched[key] = cfg

    # Always inject net_profit and total_trades as standalone computed values
    if "net_profit" in current_values:
        enriched["net_profit"] = {"current": current_values["net_profit"]}
    if "total_trades" in current_values:
        enriched["total_trades"] = {"current": current_values["total_trades"]}
            
    enriched["last_updated"] = datetime.now(timezone.utc).isoformat()
    return enriched


def compute_current_values_from_db(db: Session, account_id: str, magic_number: int) -> dict:
    """Compute current values purely from RealTrade data (no EA request needed).
    Used for batch-refreshing strategies that are NOT the active EA strategy."""
    result = {
        "max_drawdown": 0.0,
        "daily_loss": 0.0,
        "consecutive_losses": 0,
        "stagnation_days": 0,
        "stagnation_trades": 0,
        "net_profit": 0.0,
        "total_trades": 0,
    }

    query = db.query(RealTrade).filter(RealTrade.trading_account_id == account_id)
    if magic_number != 0:
        query = query.filter(RealTrade.magic_number == magic_number)

    trades = query.order_by(RealTrade.close_time.asc()).all()
    if not trades:
        return result

    equity = 0.0
    peak = 0.0
    consec = 0
    stag_trades = 0
    last_peak_time = None
    first_trade_time = trades[0].close_time

    today = datetime.now(timezone.utc).date()
    today_net_closed = 0.0

    for t in trades:
        equity += t.profit

        if t.profit < 0:
            consec += 1
        else:
            consec = 0

        if t.close_time.date() == today:
            today_net_closed += t.profit

        if equity >= peak:
            peak = equity
            stag_trades = 0
            last_peak_time = t.close_time
        else:
            stag_trades += 1

    # Use passed current stats (or 0) if it's the live active symbol
    # This function is usually for background batching, but if called, it lacks real-time floating
    # For now, it calculates purely historical closed values.
    result["max_drawdown"] = round(max(peak - equity, 0.0), 2)
    result["consecutive_losses"] = consec
    result["stagnation_trades"] = stag_trades
    result["daily_loss"] = round(abs(today_net_closed) if today_net_closed < 0 else 0.0, 2)
    result["net_profit"] = round(equity, 2)
    result["total_trades"] = len(trades)

    ref_time = last_peak_time if last_peak_time else first_trade_time
    delta = (datetime.now(timezone.utc).date() - ref_time.date()).days
    result["stagnation_days"] = max(delta, 0)

    return result


def fetch_portfolio_live_trades(db: Session, account_id: str, portfolio_id: str):
    """Fetch live trades for a portfolio, respecting each child strategy's start_date."""
    from services.portfolio_service import get_portfolio_by_id
    portfolio = get_portfolio_by_id(db, portfolio_id)
    if not portfolio or not portfolio.strategy_ids:
        return []

    strategies = db.query(Strategy).filter(Strategy.id.in_(portfolio.strategy_ids)).all()
    all_portfolio_trades = []

    for s in strategies:
        if s.magic_number is None:
            continue
            
        start_date_filter = None
        if s.start_date:
            try:
                start_date_filter = dateparser.parse(s.start_date)
                if start_date_filter and start_date_filter.tzinfo is None:
                    start_date_filter = start_date_filter.replace(tzinfo=timezone.utc)
            except Exception:
                pass

        query = db.query(RealTrade).filter(
            RealTrade.trading_account_id == account_id,
            RealTrade.magic_number == s.magic_number
        )
        if start_date_filter:
            query = query.filter(RealTrade.close_time >= start_date_filter)

        trades = query.all()
        all_portfolio_trades.extend(trades)

    # Sort chronologically
    all_portfolio_trades.sort(key=lambda t: t.close_time)
    return all_portfolio_trades


def compute_portfolio_current_values_from_db(db: Session, account_id: str, portfolio_id: str, floating_by_magic: dict = None) -> dict:
    """Compute current live values for a Portfolio by merging its child trades."""
    result = {
        "max_drawdown": 0.0,
        "daily_loss": 0.0,
        "consecutive_losses": 0,
        "stagnation_days": 0,
        "stagnation_trades": 0,
        "net_profit": 0.0,
    }

    trades = fetch_portfolio_live_trades(db, account_id, portfolio_id)
    if not trades:
        return result

    equity = 0.0
    peak = 0.0
    consec = 0
    stag_trades = 0
    last_peak_time = None
    first_trade_time = trades[0].close_time

    today = datetime.now(timezone.utc).date()
    today_net_closed = 0.0

    for t in trades:
        equity += t.profit

        if t.profit < 0:
            consec += 1
        else:
            consec = 0
            
        if t.close_time.date() == today:
            today_net_closed += t.profit

        if equity >= peak:
            peak = equity
            stag_trades = 0
            last_peak_time = t.close_time
        else:
            stag_trades += 1

    # Incorporate live floating
    total_floating = 0.0
    if floating_by_magic:
        from services.portfolio_service import get_portfolio_by_id
        from models.strategy import Strategy
        p = get_portfolio_by_id(db, portfolio_id)
        if p and p.strategy_ids:
            strategies = db.query(Strategy).filter(Strategy.id.in_(p.strategy_ids)).all()
            for s in strategies:
                if s.magic_number is not None:
                    m_str = str(s.magic_number)
                    if m_str in floating_by_magic:
                        total_floating += floating_by_magic[m_str]

    live_equity = equity + total_floating
    daily_net = today_net_closed + total_floating

    result["max_drawdown"] = round(max(peak - live_equity, 0.0), 2)
    result["consecutive_losses"] = consec
    result["stagnation_trades"] = stag_trades
    result["daily_loss"] = round(abs(daily_net) if daily_net < 0 else 0.0, 2)
    result["net_profit"] = round(live_equity, 2)

    ref_time = last_peak_time if last_peak_time else first_trade_time
    delta = (datetime.now(timezone.utc).date() - ref_time.date()).days
    result["stagnation_days"] = max(delta, 0)

    return result


def refresh_all_strategy_currents(db: Session, account_id: str, skip_magic: int | None = None, floating_by_magic: dict[str, float] | None = None):
    """Batch-refresh current metrics for ALL strategies in an account.
    Skips the strategy with magic == skip_magic (already updated by the active heartbeat).
    Uses floating_by_magic (from EA v46+) to include floating PnL in drawdown calc."""
    from sqlalchemy.orm.attributes import flag_modified

    strategies = db.query(Strategy).filter(
        Strategy.trading_account_id == account_id
    ).all()

    for s in strategies:
        if not s.risk_config or not isinstance(s.risk_config, dict):
            continue
        if skip_magic is not None and s.magic_number == skip_magic:
            continue  # Already updated by the main heartbeat

        cur = compute_current_values_from_db(db, account_id, s.magic_number)
        
        # If we have floating data from the EA, adjust the drawdown
        if floating_by_magic and str(s.magic_number) in floating_by_magic:
            floating = floating_by_magic[str(s.magic_number)]
            if floating < 0:
                cur["max_drawdown"] = round(cur["max_drawdown"] + abs(floating), 2)
        
        from models.trading_account import TradingAccount
        account = db.query(TradingAccount).filter(TradingAccount.id == account_id).first()
        master_toggles = (account.default_dashboard_layout or {}).get("master_toggles", {}) if account else {}
        s.risk_config = enrich_risk_config(s.risk_config, cur, master_toggles)
        flag_modified(s, "risk_config")

    db.commit()


def refresh_affected_portfolios_currents(db: Session, account_id: str, trigger_magic: int | None = None, floating_by_magic: dict[str, float] | None = None):
    """Batch-refresh current metrics for Custom Portfolios."""
    from services.portfolio_service import get_portfolios_for_account
    from sqlalchemy.orm.attributes import flag_modified

    portfolios = get_portfolios_for_account(db, account_id)
    
    # We need to know which strategy_ids correspond to the trigger_magic to optimize,
    # but for now we just refresh all portfolios. It's fast unless there are hundreds.
    
    for p in portfolios:
        if p.is_default:
            continue # Global portfolio is already handled by heartbeat magic=0
        if not p.risk_config or not isinstance(p.risk_config, dict):
            continue

        cur = compute_portfolio_current_values_from_db(db, account_id, p.id)
        
        # Approximate floating for the portfolio by summing floating of its active magics
        # This requires resolving strategy_ids to magics
        if floating_by_magic:
            strategies = db.query(Strategy).filter(Strategy.id.in_(p.strategy_ids or [])).all()
            total_floating = 0.0
            for s in strategies:
                if s.magic_number is not None and str(s.magic_number) in floating_by_magic:
                    total_floating += floating_by_magic[str(s.magic_number)]
            if total_floating < 0:
                cur["max_drawdown"] = round(cur["max_drawdown"] + abs(total_floating), 2)

        from models.trading_account import TradingAccount
        account = db.query(TradingAccount).filter(TradingAccount.id == account_id).first()
        master_toggles = (account.default_dashboard_layout or {}).get("master_toggles", {}) if account else {}
        p.risk_config = enrich_risk_config(p.risk_config, cur, master_toggles)
        flag_modified(p, "risk_config")

    db.commit()


def resolve_virtual_magic_portfolio(db: Session, account, virtual_magic: int):
    """Resolve a negative Virtual Magic number to a Portfolio object.

    The mapping is deterministic: -1001 → 1st custom portfolio, -1002 → 2nd, etc.
    Must use the same ordering as get_live_strategies to guarantee consistency.
    """
    from services.portfolio_service import get_portfolios_for_account

    custom_portfolios = [
        p for p in get_portfolios_for_account(db, account.id)
        if not p.is_default
    ]
    idx = abs(virtual_magic) - 1001
    if 0 <= idx < len(custom_portfolios):
        return custom_portfolios[idx]
    return None


@router.post("/heartbeat", response_model=HeartbeatResponse)
def heartbeat(req: HeartbeatRequest, db: Session = Depends(get_db)):
    """Receive live PnL from EA → return risk status.

    Authentication: via api_token in the request body (no JWT needed).
    The EA sends this every N seconds with current PnL state.
    If magic_number == 0, use the default Portfolio (Global).
    """
    # 1. Validate API token → get TradingAccount
    account = validate_api_token(db, req.api_token)
    master_toggles = (account.default_dashboard_layout or {}).get("master_toggles", {}) if account else {}

    # 2. Resolve target: magic 0 → Global Portfolio, negative → Custom Portfolio, positive → Strategy
    if req.magic_number < 0:
        # Virtual Magic → Custom Portfolio
        portfolio = resolve_virtual_magic_portfolio(db, account, req.magic_number)
        if not portfolio:
            return HeartbeatResponse(
                status="NORMAL", metrics=[], floor_level=0.0, ceiling_level=0.0,
            )
        if not portfolio.metrics_snapshot:
            return HeartbeatResponse(
                status="NORMAL", metrics=[], floor_level=0.0, ceiling_level=0.0,
                max_drawdown_limit=portfolio.max_drawdown_limit,
                daily_loss_limit=portfolio.daily_loss_limit,
                risk_config=portfolio.risk_config,
            )

        engine = RiskEngine.create_default()
        cur = compute_portfolio_current_values_from_db(db, account.id, portfolio.id, req.floating_by_magic or {})
        
        # Override live_data with actual portfolio aggregated values
        live_data = {
            "current_drawdown": cur["max_drawdown"],
            "current_pnl": cur["net_profit"],
            "open_trades": req.open_trades,
            "consecutive_losses": cur["consecutive_losses"],
            "stagnation_days": cur["stagnation_days"],
            "stagnation_trades": cur["stagnation_trades"],
        }
        
        response = engine.build_live_response(live_data, portfolio.metrics_snapshot)
        response["portfolio_equity"] = cur["net_profit"]
        
        enriched_rc = enrich_risk_config(portfolio.risk_config, cur, master_toggles)

        from sqlalchemy.orm.attributes import flag_modified
        portfolio.risk_config = enriched_rc
        flag_modified(portfolio, "risk_config")
        db.commit()

        profile = RiskProfile(portfolio)
        risk_context = profile.evaluate_heartbeat(cur)

        return HeartbeatResponse(
            **response,
            max_drawdown_limit=portfolio.max_drawdown_limit,
            daily_loss_limit=portfolio.daily_loss_limit,
            risk_config=enriched_rc,
            risk_context=risk_context,
        )

    if req.magic_number == 0:
        # Use the default portfolio for this account
        portfolio = get_default_portfolio(db, account.id)
        if not portfolio:
            portfolio = ensure_default_portfolio(db, account.id)

        if not portfolio.metrics_snapshot:
            return HeartbeatResponse(
                status="NORMAL", metrics=[], floor_level=0.0, ceiling_level=0.0,
                max_drawdown_limit=portfolio.max_drawdown_limit,
                daily_loss_limit=portfolio.daily_loss_limit,
                risk_config=portfolio.risk_config,
            )

        # Run RiskEngine live evaluation with portfolio metrics
        engine = RiskEngine.create_default()
        live_data = {
            "current_drawdown": req.current_drawdown,
            "current_pnl": req.current_pnl,
            "open_trades": req.open_trades,
            "consecutive_losses": req.consecutive_losses,
            "stagnation_days": req.stagnation_days,
            "stagnation_trades": req.stagnation_trades,
        }
        response = engine.build_live_response(live_data, portfolio.metrics_snapshot)
        # Enrich risk_config with server-computed current values
        cur = compute_current_values(db, account.id, 0, req)
        enriched_rc = enrich_risk_config(portfolio.risk_config, cur, master_toggles)
        
        # Persist enriched risk_config so the dashboard can show live values
        from sqlalchemy.orm.attributes import flag_modified
        portfolio.risk_config = enriched_rc
        flag_modified(portfolio, "risk_config")
        
        # Instead, refresh ALL strategies with their own DB-computed metrics.
        refresh_all_strategy_currents(db, account.id, skip_magic=None, floating_by_magic=req.floating_by_magic)
        refresh_affected_portfolios_currents(db, account.id, trigger_magic=0, floating_by_magic=req.floating_by_magic)
        
        # --- SANDBOX: Orphan Magics Discovery ---
        if req.floating_by_magic:
            known_magics = {str(s.magic_number) for s in account.strategies if s.magic_number is not None}
            for magic_str, pnl in req.floating_by_magic.items():
                if magic_str != "0" and magic_str not in known_magics:
                    from services.orphan_service import OrphanService
                    OrphanService.register_orphan(db, account.id, int(magic_str), pnl)
        
        db.commit()
        
        # Generate semantic/statistical risk context for the EA
        profile = RiskProfile(portfolio)
        risk_context = profile.evaluate_heartbeat(cur)

        return HeartbeatResponse(
            **response,
            max_drawdown_limit=portfolio.max_drawdown_limit,
            daily_loss_limit=portfolio.daily_loss_limit,
            risk_config=enriched_rc,
            risk_context=risk_context,
        )

    # 3. Specific strategy by magic number
    try:
        strategy = get_strategy_by_magic(db, account.id, req.magic_number)
    except HTTPException as e:
        if e.status_code == 404:
            # Plugin: Sandbox Orphan Magics
            OrphanService.register_orphan(db, account.id, req.magic_number, req.current_pnl)
            return HeartbeatResponse(
                status="NORMAL", metrics=[], floor_level=0.0, ceiling_level=0.0,
            )
        raise e

    if not strategy.metrics_snapshot:
        return HeartbeatResponse(
            status="NORMAL", metrics=[], floor_level=0.0, ceiling_level=0.0,
        )

    engine = RiskEngine.create_default()
    live_data = {
        "current_drawdown": req.current_drawdown,
        "current_pnl": req.current_pnl,
        "open_trades": req.open_trades,
        "consecutive_losses": req.consecutive_losses,
        "stagnation_days": req.stagnation_days,
        "stagnation_trades": req.stagnation_trades,
    }
    response = engine.build_live_response(live_data, strategy.metrics_snapshot)
    # Enrich risk_config with server-computed current values
    cur = compute_current_values(db, account.id, req.magic_number, req)
    enriched_rc = enrich_risk_config(strategy.risk_config, cur, master_toggles)

    # Persist enriched risk_config so the dashboard can show live values
    from sqlalchemy.orm.attributes import flag_modified
    strategy.risk_config = enriched_rc
    flag_modified(strategy, "risk_config")

    # Also refresh all OTHER strategies in this account with DB-computed metrics
    refresh_all_strategy_currents(db, account.id, skip_magic=req.magic_number, floating_by_magic=req.floating_by_magic)
    # Refresh custom portfolios that might include this strategy
    refresh_affected_portfolios_currents(db, account.id, trigger_magic=req.magic_number, floating_by_magic=req.floating_by_magic)

    # --- SANDBOX: Orphan Magics Discovery ---
    if req.floating_by_magic:
        known_magics = {str(s.magic_number) for s in account.strategies if s.magic_number is not None}
        for magic_str, pnl in req.floating_by_magic.items():
            if magic_str != "0" and magic_str not in known_magics:
                from services.orphan_service import OrphanService
                OrphanService.register_orphan(db, account.id, int(magic_str), pnl)

    db.commit()

    # Generate semantic/statistical risk context for the EA
    profile = RiskProfile(strategy)
    risk_context = profile.evaluate_heartbeat(cur)

    return HeartbeatResponse(
        **response,
        max_drawdown_limit=strategy.max_drawdown_limit,
        daily_loss_limit=strategy.daily_loss_limit,
        risk_config=enriched_rc,
        risk_context=risk_context,
    )


@router.get("/status/{api_token}/{magic_number}")
def get_status(api_token: str, magic_number: int, db: Session = Depends(get_db)):
    """Simple GET endpoint for quick status checks from EA."""
    account = validate_api_token(db, api_token)
    strategy = get_strategy_by_magic(db, account.id, magic_number)

    if not strategy.metrics_snapshot:
        return {"status": "NO_DATA", "strategy": strategy.name}

    return {
        "status": "ACTIVE",
        "strategy": strategy.name,
        "total_trades": strategy.total_trades,
        "max_drawdown_limit": strategy.max_drawdown_limit,
        "daily_loss_limit": strategy.daily_loss_limit,
    }


@router.post("/sync-trades")
def sync_trades(payload: SyncTradesPayload, db: Session = Depends(get_db)):
    """Ingest real closed deals from the EA to use as Single Source of Truth."""
    account = validate_api_token(db, payload.api_token)
    
    incoming_tickets = [t.ticket for t in payload.trades]
    if not incoming_tickets:
        return {"status": "ok", "inserted": 0}
        
    existing = db.query(RealTrade.ticket).filter(
        RealTrade.trading_account_id == account.id,
        RealTrade.ticket.in_(incoming_tickets)
    ).all()
    existing_set = {row[0] for row in existing}
    
    new_trades = []
    for t in payload.trades:
        if t.ticket in existing_set:
            continue
        new_trades.append(
            RealTrade(
                trading_account_id=account.id,
                ticket=t.ticket,
                magic_number=t.magic_number,
                symbol=t.symbol,
                volume=t.volume,
                profit=t.profit,
                # convert unix timestamp to datetime (MT5 sends seconds)
                close_time=datetime.fromtimestamp(t.close_time, tz=timezone.utc)
            )
        )
        
    if new_trades:
        db.add_all(new_trades)
        db.commit()
        
    return {"status": "ok", "inserted": len(new_trades)}


@router.get("/strategies/{api_token}")
def get_live_strategies(api_token: str, db: Session = Depends(get_db)):
    """Return all configured strategies + custom portfolios as a pipe-delimited string (for MT5).
    
    Portfolios get "Virtual Magic" numbers starting at -1001 so the EA can treat
    them as normal strategy buttons while the backend resolves them on heartbeat.
    """
    from fastapi.responses import PlainTextResponse
    
    account = validate_api_token(db, api_token)
    strategies = [s for s in account.strategies]
    
    # Base manual strategy
    result = "0|Manual;"
    
    for s in strategies:
        if s.magic_number is not None:
            safe_name = s.name.replace("|", "_").replace(";", "_")
            result += f"{s.magic_number}|{safe_name};"
    
    # Append custom portfolios as Virtual Magics (-1001, -1002, ...)
    custom_portfolios = [p for p in account.portfolios if not p.is_default]
    for idx, p in enumerate(custom_portfolios):
        virtual_magic = -(1001 + idx)
        safe_name = p.name.replace("|", "_").replace(";", "_")
        result += f"{virtual_magic}|📦 {safe_name};"
    
    return PlainTextResponse(content=result)


@router.get("/layout_config/{api_token}/{magic_number}")
def get_layout_config(api_token: str, magic_number: int, db: Session = Depends(get_db)):
    """Returns the visual JSON layout config for the MQL5 EA.
    
    Hierarchy: Workspace default_dashboard_layout → entity-level layout → system default.
    Virtual Magics (negative) resolve to custom portfolios.
    """
    account = validate_api_token(db, api_token)
    
    # 1. Try Workspace-level master template first (El Padre)
    if account.default_dashboard_layout:
        return account.default_dashboard_layout
    
    # 2. Resolve entity layout as fallback
    entity = None
    if magic_number < 0:
        entity = resolve_virtual_magic_portfolio(db, account, magic_number)
    elif magic_number == 0:
        entity = get_default_portfolio(db, account.id)
    else:
        entity = get_strategy_by_magic(db, account.id, magic_number)
        
    if not entity:
        return DashboardLayoutService.get_default_template()
        
    return DashboardLayoutService.get_layout_for_entity(entity)


@router.get("/chart/{api_token}/{magic_number}/{metric_name}")
def get_live_chart(
    api_token: str,
    magic_number: int,
    metric_name: str,
    value: float = None,
    db: Session = Depends(get_db)
):
    """Returns a BMP image plotting the current value against its historical distribution."""
    from fastapi.responses import Response
    from services.stats.chart_renderer import render_metric_chart
    from services.stats.fit_result import FitResult

    account = validate_api_token(db, api_token)


    # 1. Fetch Strategy/Portfolio to get its FitResult for this metric
    fit = FitResult.empty(metric_name)

    if magic_number <= 0:
        # Global/Portfolio mode: portfolio has no distribution_fit.
        # Fall back to the first child strategy that has a fit for this metric.
        portfolio = None
        if magic_number == 0:
            from services.queries import get_default_portfolio
            portfolio = get_default_portfolio(db, account.id)
        else:
            portfolio = resolve_virtual_magic_portfolio(db, account, magic_number)

        if portfolio and portfolio.strategy_ids:
            from models.strategy import Strategy as StratModel
            children = db.query(StratModel).filter(
                StratModel.id.in_(portfolio.strategy_ids)
            ).all()
            for child in children:
                if getattr(child, "distribution_fit", None):
                    fd = child.distribution_fit.get(metric_name)
                    if fd and (fd.get("passed") or fd.get("distribution_name") == "empirical"):
                        fit = FitResult.from_dict(fd)
                        break
    else:
        strategy = get_strategy_by_magic(db, account.id, magic_number)
        if strategy and getattr(strategy, "distribution_fit", None):
            fit_dict = strategy.distribution_fit.get(metric_name)
            if fit_dict and (fit_dict.get("passed") or fit_dict.get("distribution_name") == "empirical"):
                fit = FitResult.from_dict(fit_dict)

    # 2. Render chart with passed current value
    bmp_bytes = render_metric_chart(fit, current_val=value, width=420, height=260)

    return Response(content=bmp_bytes, media_type="image/bmp")


@router.get("/chart-data/{api_token}/{magic_number}/{metric_name}")
def get_live_chart_data(
    api_token: str,
    magic_number: int,
    metric_name: str,
    value: float = None,
    db: Session = Depends(get_db)
):
    """Returns the raw JSON data arrays for the statistical distribution."""
    from services.stats.fit_result import FitResult
    import numpy as np

    account = validate_api_token(db, api_token)

    # 1. Fetch Strategy/Portfolio to get its FitResult for this metric
    fit = FitResult.empty(metric_name)

    if magic_number <= 0:
        # Global/Portfolio mode: portfolio has no distribution_fit.
        # Fall back to the first child strategy that has a fit for this metric.
        portfolio = None
        if magic_number == 0:
            from services.queries import get_default_portfolio
            portfolio = get_default_portfolio(db, account.id)
        else:
            portfolio = resolve_virtual_magic_portfolio(db, account, magic_number)

        if portfolio and portfolio.strategy_ids:
            from models.strategy import Strategy as StratModel
            children = db.query(StratModel).filter(
                StratModel.id.in_(portfolio.strategy_ids)
            ).all()
            for child in children:
                if getattr(child, "distribution_fit", None):
                    fd = child.distribution_fit.get(metric_name)
                    if fd and (fd.get("passed") or fd.get("distribution_name") == "empirical"):
                        fit = FitResult.from_dict(fd)
                        break
    else:
        strategy = get_strategy_by_magic(db, account.id, magic_number)
        if strategy and getattr(strategy, "distribution_fit", None):
            fit_dict = strategy.distribution_fit.get(metric_name)
            if fit_dict and (fit_dict.get("passed") or fit_dict.get("distribution_name") == "empirical"):
                fit = FitResult.from_dict(fit_dict)

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
        HIGHER_IS_WORSE = {"daily_loss", "max_drawdown", "consecutive_losses",
                           "stagnation_days", "stagnation_trades"}
        if fit.metric_name in HIGHER_IS_WORSE:
            perc_vals = np.maximum(0.0, perc_vals)
        
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

    return response_data



@router.get("/equity-curve/{api_token}/{magic_number}")
def get_live_equity_curve(api_token: str, magic_number: int, db: Session = Depends(get_db)):
    """Build a live equity curve from RealTrade data — same format as backtest.

    Uses strategy.start_date as temporal frontier: only trades with
    close_time >= start_date are included (Bayesian prior/evidence separation).
    """
    account = validate_api_token(db, api_token)

    # Resolve strategy to get start_date
    start_date_filter = None
    strategy = None
    if magic_number != 0:
        strategy = get_strategy_by_magic(db, account.id, magic_number)
        if strategy and strategy.start_date:
            try:
                # Parse start_date string to datetime for filtering
                from dateutil import parser as dateparser
                start_date_filter = dateparser.parse(strategy.start_date)
                if start_date_filter and start_date_filter.tzinfo is None:
                    start_date_filter = start_date_filter.replace(tzinfo=timezone.utc)
            except Exception:
                start_date_filter = None

    # Query RealTrades — first count ALL (unfiltered), then apply start_date filter
    base_query = db.query(RealTrade).filter(RealTrade.trading_account_id == account.id)
    if magic_number != 0:
        base_query = base_query.filter(RealTrade.magic_number == magic_number)

    total_all_trades = base_query.count()

    query = base_query
    if start_date_filter:
        query = query.filter(RealTrade.close_time >= start_date_filter)

    trades = query.order_by(RealTrade.close_time.asc()).all()

    if not trades:
        return {"equity_curve": [], "total_trades": 0, "net_profit": 0.0, "total_all_trades": total_all_trades}

    # Build equity curve — identical logic to csv_parser.py
    equity = 0.0
    equity_curve = []
    
    # Inyectar el punto de origen en 0.0 para que el gráfico no "flote"
    origin_date = None
    if start_date_filter:
        origin_date = start_date_filter.strftime("%Y.%m.%d %H:%M:%S")
    elif trades[0].close_time:
        from datetime import timedelta
        origin_date = (trades[0].close_time - timedelta(seconds=1)).strftime("%Y.%m.%d %H:%M:%S")

    equity_curve.append({
        "trade": 0,
        "equity": 0.0,
        "date": origin_date,
    })

    for i, t in enumerate(trades):
        equity += t.profit
        equity_curve.append({
            "trade": i + 1,
            "equity": round(equity, 2),
            "date": t.close_time.strftime("%Y.%m.%d %H:%M:%S") if t.close_time else None,
        })

    return {
        "equity_curve": equity_curve,
        "total_trades": len(trades),
        "net_profit": round(equity, 2),
        "total_all_trades": total_all_trades,
    }


@router.get("/equity-curve-portfolio/{api_token}/{portfolio_id}")
def get_live_equity_curve_portfolio(api_token: str, portfolio_id: str, db: Session = Depends(get_db)):
    """Build a live equity curve for a Custom Portfolio from RealTrade data.
    Respects the individual start_date of each child strategy.
    """
    account = validate_api_token(db, api_token)
    
    # 1. Fetch trades
    trades = fetch_portfolio_live_trades(db, account.id, portfolio_id)
    
    if not trades:
        return {"equity_curve": [], "total_trades": 0, "net_profit": 0.0, "total_all_trades": 0}

    # 2. Build combined curve
    equity = 0.0
    equity_curve = []
    
    # Inyectar el punto de origen en 0.0 para que el gráfico no "flote"
    if trades[0].close_time:
        from datetime import timedelta
        origin_date = (trades[0].close_time - timedelta(seconds=1)).strftime("%Y.%m.%d %H:%M:%S")
        equity_curve.append({
            "trade": 0,
            "equity": 0.0,
            "date": origin_date,
        })

    for i, t in enumerate(trades):
        equity += t.profit
        equity_curve.append({
            "trade": i + 1,
            "equity": round(equity, 2),
            "date": t.close_time.strftime("%Y.%m.%d %H:%M:%S") if t.close_time else None,
        })

    return {
        "equity_curve": equity_curve,
        "total_trades": len(trades),
        "net_profit": round(equity, 2),
        "total_all_trades": len(trades), # simplified for portfolio
    }
