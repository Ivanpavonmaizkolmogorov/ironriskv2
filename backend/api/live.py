"""Live API routes — EA heartbeat endpoint (API Token auth, no JWT)."""

from datetime import datetime, timezone
from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException
from typing import Dict, Any

from sqlalchemy.orm import Session
from sqlalchemy import func

from models.database import get_db, SessionLocal
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
from services.notifications import AlertEngine
import time
import asyncio

def dispatch_alerts_background(user_id: str, target_type: str, target_id: str, metrics: Dict[str, Any]):
    """Fire and forget async wrapper for pushing metrics to the AlertEngine."""
    async def evaluate():
        try:
            with SessionLocal() as db:
                engine = AlertEngine(db)
                await engine.evaluate_metrics(user_id, target_type, target_id, metrics)
        except Exception as e:
            import logging
            logging.getLogger("ironrisk.alert_engine").error(f"Background evaluation failed: {e}")
    try:
        loop = asyncio.get_running_loop()
        loop.create_task(evaluate())
    except RuntimeError:
        # No running event loop (e.g. running inside a sync FastAPI thread pool)
        asyncio.run(evaluate())
    except Exception as e:
        import logging
        logging.getLogger("ironrisk.alert_engine").error(f"Failed to dispatch: {e}")

router = APIRouter(prefix="/api/live", tags=["Live EA"])

_LAST_REFRESH = {}

def background_refresh(account_id: str, trigger_magic: int, floating_by_magic: dict | None):
    global _LAST_REFRESH
    now = time.time()
    # At most once every 5 seconds per account, prevent crushing the database.
    if now - _LAST_REFRESH.get(account_id, 0) < 5.0:
        return
    _LAST_REFRESH[account_id] = now
    
    from models.database import SessionLocal
    db = SessionLocal()
    try:
        refresh_all_strategy_currents(db, account_id, skip_magic=None, floating_by_magic=floating_by_magic)
        refresh_affected_portfolios_currents(db, account_id, trigger_magic=trigger_magic, floating_by_magic=floating_by_magic)
    finally:
        db.close()



import math
import json
import os

_I18N_CACHE = {}

def flatten_dict(d, parent_key='', sep='.'):
    items = []
    for k, v in d.items():
        new_key = f"{parent_key}{sep}{k}" if parent_key else k
        if isinstance(v, dict):
            items.extend(flatten_dict(v, new_key, sep=sep).items())
        else:
            items.append((new_key, v))
    return dict(items)

def get_i18n(lang: str) -> dict:
    if lang in _I18N_CACHE:
        return _I18N_CACHE[lang]
    path = os.path.join(os.path.dirname(__file__), '..', '..', 'webapp', 'messages', f'{lang}.json')
    if not os.path.exists(path):
        lang = "en"
        path = os.path.join(os.path.dirname(__file__), '..', '..', 'webapp', 'messages', 'en.json')
    try:
        with open(path, 'r', encoding='utf-8') as f:
            data = json.load(f)
        flat = flatten_dict(data)
        _I18N_CACHE[lang] = flat
        return flat
    except Exception:
        return {}

def build_verdict_reasons(risk_context: dict, metrics_snapshot: dict | None, lang: str) -> list[str]:
    translations = get_i18n(lang)
    tr = lambda k, default="": translations.get(k) or translations.get("ui." + k) or translations.get("math." + k) or default
    
    reasons = []
    
    # Prefix mapping matched with MQL5 expected tokens
    prefix = {"fatal": "[FATAL]", "red": "[RED]", "yellow": "[AMBER]", "amber": "[AMBER]", "green": "[GREEN]"}
    
    # 1. Empiric Risks (Risk Gauges) from risk_context directly
    risk_label = tr("bayesian.empiricalRisk", "Riesgo Empírico")
    for metric, ctx in risk_context.items():
        color = ctx.get("color") or "green"
        if color not in ["amber", "yellow", "red", "fatal"]:
            continue
            
        pct = ctx.get("percentile") or 0.0
        limit = ctx.get("limit") or 0.0
        curr = ctx.get("current") or 0.0
        
        name = tr("gaugeNames." + metric, metric)
        val_str = f"${curr:,.2f}" if "loss" in metric or "drawdown" in metric or "profit" in metric else f"{curr}"
        
        extra = ""
        if limit > 0:
            limit_str = f"${limit:,.2f}" if "loss" in metric or "drawdown" in metric or "profit" in metric else f"{limit}"
            pct_used = (curr / limit) * 100
            lim_tmpl = tr("math.gaugePctLim", "{pct}% de tu Límite ({limit})")
            extra = " - " + lim_tmpl.replace("{pct}", f"{pct_used:.1f}").replace("{limit}", limit_str)
            
        pfx = prefix.get(color, "[GREEN]")
        if color == "fatal":
            reasons.append(f"{pfx} {name}: {tr('ui.limitBreached', 'Límite rebasado')} ({val_str}){extra}")
        else:
            reasons.append(f"{pfx} {risk_label}: {name} P{math.floor(pct)} ({val_str}){extra}")

    # 2. Bayesian (info_report) from metrics_snapshot cache
    if metrics_snapshot and "bayes_cache" in metrics_snapshot:
        info_report = metrics_snapshot["bayes_cache"].get("info_report", {})
        signals = info_report.get("signals", [])
        stat_label = tr("bayesian.statisticalInference", "Inferencia Estadística")
        for sig in signals:
            sev = sig.get("severity", "info")
            if sev == "warning": color = "red"
            elif sev == "notable": color = "amber"
            else: color = "green"
            
            if color not in ["amber", "yellow", "red", "fatal"]:
                continue
            
            pfx = prefix.get(color, "[GREEN]")
            
            # format the text
            tmpl = sig.get("detail", "")
            i18n_key = sig.get("i18n_key")
            params = sig.get("i18n_params", {})
            if i18n_key:
                tmpl = tr("math." + i18n_key, tmpl)
                for k, v in params.items():
                    tmpl = tmpl.replace("{" + k + "}", str(v))
            
            reasons.append(f"{pfx} {stat_label}: {tmpl}")

    return "|".join(reasons)

def compute_current_values(db: Session, account_id: str, magic_number: int, req: HeartbeatRequest, start_date: str = None) -> dict:
    """Compute current values for risk variables using RealTrade as Source of Truth.
    Uses LiveTradesService for consistent BT/Live filtering."""
    from services.live_trades_service import LiveTradesService
    result = {
        "max_drawdown": round(req.current_drawdown, 2),
        "daily_loss": 0.0,
        "consecutive_losses": 0,
        "stagnation_days": 0,
        "stagnation_trades": 0,
        "net_profit": 0.0,
        "total_trades": 0,
    }

    # Use shared service if start_date available, else fallback to all trades
    if start_date:
        trades = LiveTradesService.get_live_trades(db, account_id, magic_number, start_date)
    else:
        trades = LiveTradesService.get_all_trades_unfiltered(db, account_id, magic_number)
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
    
    # Infer open_trades from floating
    floating = req.floating_by_magic.get(str(magic_number), 0.0) if req.floating_by_magic else 0.0
    result["open_trades"] = 1 if floating != 0.0 else 0
    
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
                new_cfg["enabled"] = False if key == "master_verdict" else master_toggles.get(key, False)
            enriched[key] = new_cfg
        else:
            enriched[key] = cfg

    # Always inject net_profit and total_trades as standalone computed values
    if "net_profit" in current_values:
        enriched["net_profit"] = {"current": current_values["net_profit"]}
    if "total_trades" in current_values:
        enriched["total_trades"] = {"current": current_values["total_trades"]}
    if "open_trades" in current_values:
        enriched["open_trades"] = {"current": current_values["open_trades"]}
            
    enriched["last_updated"] = datetime.now(timezone.utc).isoformat()
    return enriched


def compute_current_values_from_db(db: Session, account_id: str, magic_number: int, start_date: str = None) -> dict:
    """Compute current values purely from RealTrade data (no EA request needed).
    Used for batch-refreshing strategies that are NOT the active EA strategy.
    Uses LiveTradesService for consistent BT/Live filtering."""
    from services.live_trades_service import LiveTradesService
    result = {
        "max_drawdown": 0.0,
        "daily_loss": 0.0,
        "consecutive_losses": 0,
        "stagnation_days": 0,
        "stagnation_trades": 0,
        "net_profit": 0.0,
        "total_trades": 0,
    }

    # Use shared service if start_date available, else fallback to all trades
    if start_date:
        trades = LiveTradesService.get_live_trades(db, account_id, magic_number, start_date)
    else:
        trades = LiveTradesService.get_all_trades_unfiltered(db, account_id, magic_number)
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


def get_portfolio_all_trades_count(db: Session, account_id: str, portfolio_id: str) -> int:
    """Get the absolute total number of trades for all strategies in a portfolio, ignoring start_date."""
    from services.portfolio_service import get_portfolio_by_id
    portfolio = get_portfolio_by_id(db, portfolio_id)
    if not portfolio or not portfolio.strategy_ids:
        return 0

    strategies = db.query(Strategy).filter(Strategy.id.in_(portfolio.strategy_ids)).all()
    count = 0
    for s in strategies:
        if s.magic_number is None:
            continue
        count += db.query(RealTrade).filter(
            RealTrade.trading_account_id == account_id,
            RealTrade.magic_number.in_(s.all_magic_numbers)
        ).count()
    
    return count


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
        effective_start = portfolio.start_date if getattr(portfolio, "start_date", None) else s.start_date
        if effective_start:
            try:
                start_date_filter = dateparser.parse(effective_start)
                if start_date_filter and start_date_filter.tzinfo is None:
                    start_date_filter = start_date_filter.replace(tzinfo=timezone.utc)
            except Exception:
                pass

        query = db.query(RealTrade).filter(
            RealTrade.trading_account_id == account_id,
            RealTrade.magic_number.in_(s.all_magic_numbers)
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
        "total_trades": 0,
        "total_floating": 0.0,
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
    result["total_trades"] = len(trades)
    result["total_floating"] = total_floating

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
        if skip_magic is not None and skip_magic in s.all_magic_numbers:
            continue  # Already updated by the main heartbeat

        cur = compute_current_values_from_db(db, account_id, s.all_magic_numbers, start_date=s.start_date)
        
        # If we have floating data from the EA, adjust the drawdown
        floating = 0.0
        if floating_by_magic:
            for m in s.all_magic_numbers:
                if str(m) in floating_by_magic:
                    floating += floating_by_magic[str(m)]
        if floating < 0:
            cur["max_drawdown"] = round(cur["max_drawdown"] + abs(floating), 2)
        
        from models.trading_account import TradingAccount
        account = db.query(TradingAccount).filter(TradingAccount.id == account_id).first()
        master_toggles = (account.default_dashboard_layout or {}).get("master_toggles", {}) if account else {}
        s.risk_config = enrich_risk_config(s.risk_config, cur, master_toggles)
        flag_modified(s, "risk_config")

        if account:
            dispatch_alerts_background(account.user_id, "strategy", s.id, cur)

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
                for m in s.all_magic_numbers:
                    if str(m) in floating_by_magic:
                        total_floating += floating_by_magic[str(m)]
            if total_floating < 0:
                cur["max_drawdown"] = round(cur["max_drawdown"] + abs(total_floating), 2)

        from models.trading_account import TradingAccount
        account = db.query(TradingAccount).filter(TradingAccount.id == account_id).first()
        master_toggles = (account.default_dashboard_layout or {}).get("master_toggles", {}) if account else {}
        p.risk_config = enrich_risk_config(p.risk_config, cur, master_toggles)
        flag_modified(p, "risk_config")

        if account:
            dispatch_alerts_background(account.user_id, "portfolio", p.id, cur)

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
def heartbeat(req: HeartbeatRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    """Receive live PnL from EA → return risk status.

    Authentication: via api_token in the request body (no JWT needed).
    The EA sends this every N seconds with current PnL state.
    If magic_number == 0, use the default Portfolio (Global).
    """
    # 1. Validate API token → get TradingAccount
    account = validate_api_token(db, req.api_token)
    
    if not account:
        raise HTTPException(status_code=401, detail="Invalid API Token")

    # 1.5 Enforce MT5 Account matching if the workspace is locked to one
    if account.account_number:
        incoming_acc = str(req.account_number).strip() if req.account_number else ""
        registered_acc = str(account.account_number).strip()
        
        # If EA doesn't send it, or sends a different one -> KILL
        if incoming_acc != registered_acc:
            return HeartbeatResponse(
                status="KILL",
                metrics=[],
                floor_level=0.0,
                ceiling_level=0.0,
                max_drawdown_limit=0.0,
                daily_loss_limit=0.0,
                kill=True,
                kill_reason=f"ACCOUNT MISMATCH: Este workspace está bloqueado para la cuenta {registered_acc}, pero MT5 es {incoming_acc or 'desconocida'}.",
            )

    # 1.6 Guardar timestamp de conexión activa
    account.last_heartbeat_at = datetime.now(timezone.utc)
    db.commit()

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
        # Approximate open trades as a boolean or pass 0 since we can't easily count exact open tickets from heartbeat payload, BUT we can infer if total_floating != 0
        live_data = {
            "current_drawdown": cur["max_drawdown"],
            "current_pnl": cur["net_profit"],
            "open_trades": req.open_trades if req.open_trades > 0 else (1 if cur["total_floating"] != 0 else 0),
            "consecutive_losses": cur["consecutive_losses"],
            "stagnation_days": cur["stagnation_days"],
            "stagnation_trades": cur["stagnation_trades"],
        }
        
        response = engine.build_live_response(live_data, portfolio.metrics_snapshot)
        response["portfolio_equity"] = cur["net_profit"]
        
        p_pos = 0.0
        snap = getattr(portfolio, "metrics_snapshot", None) or {}
        bayes_cache = snap.get("bayes_cache", {})
        p_pos = bayes_cache.get("p_positive", 0.0) * 100.0
        cur["bayes_blind_risk"] = 100.0 - p_pos
                
        enriched_rc = enrich_risk_config(portfolio.risk_config, cur, master_toggles)

        from sqlalchemy.orm.attributes import flag_modified
        portfolio.risk_config = enriched_rc
        flag_modified(portfolio, "risk_config")
        db.commit()

        dispatch_alerts_background(account.user_id, "portfolio", portfolio.id, cur)

        profile = RiskProfile(portfolio)
        risk_context = profile.evaluate_heartbeat(cur)

        # Generate string verdict matching Web UI thresholds without emojis for MT5 GDI compatibility
        colors = [ctx.get("color") for ctx in risk_context.values()]
        verdict_text = "CONSISTENTE"
        if "fatal" in colors or response.get("status") == "KILL":
            verdict_text = "HALT"
        elif "red" in colors:
            verdict_text = "EN PELIGRO"
        elif "yellow" in colors or "amber" in colors:
            verdict_text = "DEGRADADO"

        verdict_reasons = build_verdict_reasons(risk_context, portfolio.metrics_snapshot, req.language)

        return HeartbeatResponse(
            **response,
            max_drawdown_limit=portfolio.max_drawdown_limit,
            daily_loss_limit=portfolio.daily_loss_limit,
            risk_config=enriched_rc,
            risk_context=risk_context,
            master_verdict=verdict_text,
            verdict_reasons=verdict_reasons,
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
        cur = compute_current_values(db, account.id, 0, req, start_date=portfolio.strategies[0].start_date if hasattr(portfolio, 'strategies') and portfolio.strategies else None)
        
        p_pos = 0.0
        snap = getattr(portfolio, "metrics_snapshot", None) or {}
        bayes_cache = snap.get("bayes_cache", {})
        p_pos = bayes_cache.get("p_positive", 0.0) * 100.0
        cur["bayes_blind_risk"] = 100.0 - p_pos

        enriched_rc = enrich_risk_config(portfolio.risk_config, cur, master_toggles)
        
        # Persist enriched risk_config so the dashboard can show live values
        from sqlalchemy.orm.attributes import flag_modified
        portfolio.risk_config = enriched_rc
        flag_modified(portfolio, "risk_config")
        
        dispatch_alerts_background(account.user_id, "portfolio", portfolio.id, cur)
        
        # Instead, refresh ALL strategies with their own DB-computed metrics.
        background_tasks.add_task(background_refresh, account.id, 0, req.floating_by_magic)
        
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

        # Generate string verdict matching Web UI thresholds without emojis for MT5 GDI compatibility
        colors = [ctx.get("color") for ctx in risk_context.values()]
        verdict_text = "CONSISTENTE"
        if "fatal" in colors or response.get("status") == "KILL":
            verdict_text = "HALT"
        elif "red" in colors:
            verdict_text = "EN PELIGRO"
        elif "yellow" in colors or "amber" in colors:
            verdict_text = "DEGRADADO"

        verdict_reasons = build_verdict_reasons(risk_context, portfolio.metrics_snapshot, req.language)

        return HeartbeatResponse(
            **response,
            max_drawdown_limit=portfolio.max_drawdown_limit,
            daily_loss_limit=portfolio.daily_loss_limit,
            risk_config=enriched_rc,
            risk_context=risk_context,
            master_verdict=verdict_text,
            verdict_reasons=verdict_reasons,
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
    cur = compute_current_values(db, account.id, req.magic_number, req, start_date=strategy.start_date)
            
    p_pos = 0.0
    snap = getattr(strategy, "metrics_snapshot", None) or {}
    bayes_cache = snap.get("bayes_cache", {})
    p_pos = bayes_cache.get("p_positive", 0.0) * 100.0
    cur["bayes_blind_risk"] = 100.0 - p_pos

    enriched_rc = enrich_risk_config(strategy.risk_config, cur, master_toggles)

    # Persist enriched risk_config so the dashboard can show live values
    from sqlalchemy.orm.attributes import flag_modified
    strategy.risk_config = enriched_rc
    flag_modified(strategy, "risk_config")

    dispatch_alerts_background(account.user_id, "strategy", strategy.id, cur)

    # Also refresh all OTHER strategies in this account with DB-computed metrics in background
    background_tasks.add_task(background_refresh, account.id, req.magic_number, req.floating_by_magic)

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

    # Generate string verdict matching Web UI thresholds without emojis for MT5 GDI compatibility
    colors = [ctx.get("color") for ctx in risk_context.values()]
    verdict_text = "CONSISTENTE"
    if "fatal" in colors or response.get("status") == "KILL":
        verdict_text = "HALT"
    elif "red" in colors:
        verdict_text = "EN PELIGRO"
    elif "yellow" in colors or "amber" in colors:
        verdict_text = "DEGRADADO"

    verdict_reasons = build_verdict_reasons(risk_context, strategy.metrics_snapshot, req.language)

    return HeartbeatResponse(
        **response,
        max_drawdown_limit=strategy.max_drawdown_limit,
        daily_loss_limit=strategy.daily_loss_limit,
        risk_config=enriched_rc,
        risk_context=risk_context,
        master_verdict=verdict_text,
        verdict_reasons=verdict_reasons,
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
    
    # Prevent data contamination: reject if MT5 account doesn't match token binding
    if account.account_number and payload.account_number:
        if str(account.account_number) != str(payload.account_number):
            raise HTTPException(
                status_code=403,
                detail=f"Token bound to MT5 Account {account.account_number}. Received {payload.account_number}"
            )
    
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
                comment=t.comment,
                # convert unix timestamp to datetime (MT5 sends seconds)
                close_time=datetime.fromtimestamp(t.close_time, tz=timezone.utc),
                open_time=datetime.fromtimestamp(t.open_time, tz=timezone.utc) if t.open_time else None,
                open_price=t.open_price,
                close_price=t.close_price,
                sl=t.sl,
                tp=t.tp,
                deal_type=t.deal_type,
                swap=t.swap,
                commission=t.commission
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
        if s.magic_number is not None and s.magic_number != 0:
            safe_name = s.name.replace("|", "_").replace(";", "_")
            result += f"{s.magic_number}|{safe_name};"
    
    # Append custom portfolios as Virtual Magics (-1001, -1002, ...)
    custom_portfolios = [p for p in account.portfolios if not p.is_default]
    for idx, p in enumerate(custom_portfolios):
        virtual_magic = -(1001 + idx)
        safe_name = p.name.replace("|", "_").replace(";", "_")
        
        # Get all child magics associated with this portfolio
        child_magics = []
        if p.strategy_ids:
            for strat in strategies:
                if str(strat.id) in p.strategy_ids and strat.magic_number:
                    child_magics.append(str(strat.magic_number))
        magics_str = ",".join(child_magics)
        
        # Format: magic|name|associated_magics
        result += f"{virtual_magic}|{safe_name}|{magics_str};"
    
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

    Uses LiveTradesService (shared with Bayes) for consistent BT/Live separation.
    start_date is the temporal frontier: only trades after it are "Live".
    """
    account = validate_api_token(db, api_token)

    # Resolve strategy to get start_date — works for ALL magic numbers including 0
    from services.live_trades_service import LiveTradesService
    strategy = None
    start_date = None
    
    if magic_number != 0:
        strategy = get_strategy_by_magic(db, account.id, magic_number)
    else:
        # For magic=0, find strategy with magic_number=0 in this account
        strategy = db.query(Strategy).filter(
            Strategy.trading_account_id == account.id,
            Strategy.magic_number == 0,
        ).first()
    
    if strategy:
        start_date = strategy.start_date

    # Determine the magic filter: use all_magic_numbers if strategy found, else raw param
    magic_filter = strategy.all_magic_numbers if strategy else magic_number

    # Count ALL trades (unfiltered) for "total_all_trades" stat
    all_trades = LiveTradesService.get_all_trades_unfiltered(db, account.id, magic_filter)
    total_all_trades = len(all_trades)

    # Get filtered live trades via shared service
    trades = LiveTradesService.get_live_trades(db, account.id, magic_filter, start_date)

    if not trades:
        return {"equity_curve": [], "total_trades": 0, "net_profit": 0.0, "total_all_trades": total_all_trades}

    # Build equity curve — identical logic to csv_parser.py
    equity = 0.0
    equity_curve = []
    
    # Inject origin point at 0.0 so the chart doesn't "float"
    origin_date = None
    if start_date:
        try:
            from dateutil import parser as dateparser
            start_dt = dateparser.parse(start_date)
            origin_date = start_dt.strftime("%Y.%m.%d %H:%M:%S") if start_dt else None
        except Exception:
            pass
    if not origin_date and trades[0].close_time:
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
    total_all_trades = get_portfolio_all_trades_count(db, account.id, portfolio_id)
    
    if not trades:
        return {"equity_curve": [], "total_trades": 0, "net_profit": 0.0, "total_all_trades": total_all_trades}

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
        "total_all_trades": total_all_trades,
    }
