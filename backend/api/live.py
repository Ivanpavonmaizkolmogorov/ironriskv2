"""Live API routes — EA heartbeat endpoint (API Token auth, no JWT)."""

from datetime import datetime, timezone
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from models.database import get_db
from schemas.live import HeartbeatRequest, HeartbeatResponse
from services.trading_account_service import validate_api_token
from services.strategy_service import get_strategy_by_magic
from services.portfolio_service import get_default_portfolio, ensure_default_portfolio
from core.risk_engine import RiskEngine

router = APIRouter(prefix="/api/live", tags=["Live EA"])


def compute_current_values(equity_curve: list, req: HeartbeatRequest) -> dict:
    """Compute current values for all risk variables.

    Hybrid approach:
      - max_drawdown, daily_loss: from EA's LIVE heartbeat data (only the EA
        knows the live peak and today's closed trades from MT5).
      - consecutive_losses, stagnation: from equity_curve (backtest/DB data).

    Returns:
        dict with current values keyed by risk variable name.
    """
    result = {
        "max_drawdown": 0.0,
        "daily_loss": 0.0,
        "consecutive_losses": 0,
        "stagnation_days": 0,
        "stagnation_trades": 0,
    }

    # --- LIVE data (from EA heartbeat) ---
    # The EA computes these from MT5 deal history + open positions
    result["max_drawdown"] = round(req.current_drawdown, 2)
    result["consecutive_losses"] = req.consecutive_losses  # EA counts from MT5 deals
    # daily_loss: EA sends today's closed losses (absolute value)
    # We'll add this field; for now use 0 if not available

    # --- BACKTEST data (from equity_curve in DB) ---
    if not equity_curve:
        return result

    # consecutive_losses: EA value takes priority over equity_curve fallback
    if req.consecutive_losses == 0 and equity_curve:
        consec = 0
        prev_eq = 0.0
        for i, point in enumerate(equity_curve):
            eq = point.get("equity", 0)
            if i == 0:
                prev_eq = eq
                continue
            trade_pnl = eq - prev_eq
            prev_eq = eq
            if trade_pnl < 0:
                consec += 1
            else:
                consec = 0
        result["consecutive_losses"] = consec

    # stagnation_days.current = days since last new peak
    last_peak_date = None
    running_peak = 0.0
    for point in equity_curve:
        eq = point.get("equity", 0)
        if eq >= running_peak:
            running_peak = eq
            date_str = point.get("date", "")
            if date_str:
                try:
                    last_peak_date = datetime.strptime(date_str[:10], "%Y.%m.%d")
                except (ValueError, IndexError):
                    pass
    if last_peak_date:
        delta = (datetime.now() - last_peak_date).days
        result["stagnation_days"] = max(delta, 0)

    # stagnation_trades.current = trades since last new peak
    stag_trades = 0
    running_peak = 0.0
    for point in equity_curve:
        eq = point.get("equity", 0)
        if eq >= running_peak:
            running_peak = eq
            stag_trades = 0
        else:
            stag_trades += 1
    result["stagnation_trades"] = stag_trades

    return result


def enrich_risk_config(risk_config: dict, current_values: dict) -> dict:
    """Inject 'current' values into risk_config for the EA to display."""
    if not risk_config:
        return risk_config
    enriched = {}
    for key, cfg in risk_config.items():
        if isinstance(cfg, dict):
            enriched[key] = {**cfg, "current": current_values.get(key, 0)}
        else:
            enriched[key] = cfg
    return enriched


@router.post("/heartbeat", response_model=HeartbeatResponse)
def heartbeat(req: HeartbeatRequest, db: Session = Depends(get_db)):
    """Receive live PnL from EA → return risk status.

    Authentication: via api_token in the request body (no JWT needed).
    The EA sends this every N seconds with current PnL state.
    If magic_number == 0, use the default Portfolio (Global).
    """
    # 1. Validate API token → get TradingAccount
    account = validate_api_token(db, req.api_token)

    # 2. magic_number == 0 → Portfolio Global; else → specific Strategy
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
        cur = compute_current_values(portfolio.equity_curve or [], req)
        enriched_rc = enrich_risk_config(portfolio.risk_config, cur)
        return HeartbeatResponse(
            **response,
            max_drawdown_limit=portfolio.max_drawdown_limit,
            daily_loss_limit=portfolio.daily_loss_limit,
            risk_config=enriched_rc,
        )

    # 3. Specific strategy by magic number
    strategy = get_strategy_by_magic(db, account.id, req.magic_number)

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
    cur = compute_current_values(strategy.equity_curve or [], req)
    enriched_rc = enrich_risk_config(strategy.risk_config, cur)
    return HeartbeatResponse(
        **response,
        max_drawdown_limit=strategy.max_drawdown_limit,
        daily_loss_limit=strategy.daily_loss_limit,
        risk_config=enriched_rc,
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


@router.get("/strategies/{api_token}")
def get_live_strategies(api_token: str, db: Session = Depends(get_db)):
    """Return all configured strategies for the user as a pipe-delimited string (for MT5)."""
    from fastapi.responses import PlainTextResponse
    from services.strategy_service import get_user_strategies
    
    account = validate_api_token(db, api_token)
    # Get strategies strictly belonging to this trading account
    # Wait, get_user_strategies currently gets by user_id... We want to get by account!
    strategies = [s for s in account.strategies]
    
    # Base manual strategy
    result = "0|Manual;"
    
    for s in strategies:
        if s.magic_number is not None:
            # We use the DB-stored magic_number
            # Sanitize the name so it doesn't break our delimiter
            safe_name = s.name.replace("|", "_").replace(";", "_")
            result += f"{s.magic_number}|{safe_name};"
            
    return PlainTextResponse(content=result)
