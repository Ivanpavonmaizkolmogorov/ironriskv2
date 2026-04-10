"""Portfolio API routes — CRUD for portfolio management."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from models.database import get_db
from models.portfolio import Portfolio
from models.strategy import Strategy
from services.auth_service import get_current_user
from services.portfolio_service import (
    ensure_default_portfolio,
    get_portfolios_for_account,
    get_portfolio_by_id,
    recalculate_portfolio,
    remove_strategy_from_portfolios,
)
from schemas.portfolio import (
    PortfolioCreate,
    PortfolioUpdate,
    PortfolioResponse,
    PortfolioListResponse,
)

router = APIRouter(prefix="/api/portfolios", tags=["Portfolios"])


@router.get("/", response_model=PortfolioListResponse)
def list_portfolios(
    trading_account_id: str,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """List all portfolios for a trading account."""
    portfolios = get_portfolios_for_account(db, trading_account_id)
    return PortfolioListResponse(portfolios=portfolios)


@router.post("/", response_model=PortfolioResponse)
def create_portfolio(
    req: PortfolioCreate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """Create a new custom portfolio."""
    portfolio = Portfolio(
        trading_account_id=req.trading_account_id,
        name=req.name,
        strategy_ids=req.strategy_ids,
        auto_include_new=False,
        is_default=False,
    )
    db.add(portfolio)
    db.commit()
    db.refresh(portfolio)

    if req.strategy_ids:
        recalculate_portfolio(db, portfolio)

    return portfolio


@router.put("/{portfolio_id}", response_model=PortfolioResponse)
def update_portfolio(
    portfolio_id: str,
    req: PortfolioUpdate,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """Update a portfolio (rename, toggle strategies, update risk_config)."""
    portfolio = get_portfolio_by_id(db, portfolio_id)
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")

    needs_recalc = False

    if req.name is not None:
        portfolio.name = req.name

    if req.strategy_ids is not None:
        portfolio.strategy_ids = req.strategy_ids
        needs_recalc = True

    if req.risk_config is not None:
        portfolio.risk_config = req.risk_config

    if req.start_date is not None:
        portfolio.start_date = req.start_date


    db.commit()

    if needs_recalc:
        recalculate_portfolio(db, portfolio)

    db.refresh(portfolio)
    return portfolio


@router.delete("/{portfolio_id}")
def delete_portfolio(
    portfolio_id: str,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """Delete a portfolio (cannot delete the default Global portfolio)."""
    portfolio = get_portfolio_by_id(db, portfolio_id)
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")
    if portfolio.is_default:
        raise HTTPException(status_code=400, detail="Cannot delete the default Global portfolio")

    db.delete(portfolio)
    db.commit()
    return {"detail": "Portfolio deleted"}


from typing import List
from schemas.strategy import LiveTradeResponse

@router.get("/{portfolio_id}/trades", response_model=List[LiveTradeResponse])
def get_portfolio_trades(
    portfolio_id: str,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
    user=Depends(get_current_user),
):
    """Returns paginated trades for all strategies within a portfolio."""
    portfolio = get_portfolio_by_id(db, portfolio_id)
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")
        
    from models.real_trade import RealTrade
    
    query = db.query(RealTrade).filter(RealTrade.trading_account_id == portfolio.trading_account_id)
    
    # Portfolio trades consist of all trades from child strategies, respecting their start_dates.
    # We can either fetch the strategies, build individual conditions, or for a simpler approach:
    # Just filter by the magic numbers if start_date isn't an issue, OR use the Strategy service.
    
    strategies = db.query(Strategy).filter(
        Strategy.id.in_(portfolio.strategy_ids or [])
    ).all()
    
    from sqlalchemy import or_, and_
    from datetime import timezone
    from dateutil import parser
    
    conditions = []
    for st in strategies:
        if st.magic_number is None:
            continue
            
        st_cond = RealTrade.magic_number.in_(st.all_magic_numbers)
        effective_start = portfolio.start_date if getattr(portfolio, "start_date", None) else st.start_date
        if effective_start:
            try:
                start_date_filter = parser.parse(effective_start)
                if start_date_filter.tzinfo is None:
                    start_date_filter = start_date_filter.replace(tzinfo=timezone.utc)
                st_cond = and_(st_cond, RealTrade.close_time >= start_date_filter)
            except Exception:
                pass
        conditions.append(st_cond)
        
    if not conditions:
        return []
        
    query = query.filter(or_(*conditions))
    query = query.order_by(RealTrade.close_time.desc())
    
    if limit > 0:
        query = query.offset(offset).limit(limit)
        
    return query.all()


@router.get("/{portfolio_id}/chart/{metric_name}")
def get_portfolio_chart(
    portfolio_id: str,
    metric_name: str,
    value: float = None,
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Returns a BMP image plotting the portfolio's current value against its historical distribution."""
    from fastapi.responses import Response
    from services.stats.chart_renderer import render_metric_chart
    from services.stats.fit_result import FitResult
    
    portfolio = get_portfolio_by_id(db, portfolio_id)
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")
        
    if not getattr(portfolio, "distribution_fit", None):
        fit = FitResult.empty(metric_name)
    else:
        fit_dict = portfolio.distribution_fit.get(metric_name)
        if fit_dict and (fit_dict.get("passed") or fit_dict.get("distribution_name") == "empirical"):
            fit = FitResult.from_dict(fit_dict)
        else:
            fit = FitResult.empty(metric_name)
            
    bmp_bytes = render_metric_chart(fit, current_val=value, width=420, height=260)
    return Response(content=bmp_bytes, media_type="image/bmp")


@router.get("/{portfolio_id}/chart-data/{metric_name}")
def get_portfolio_chart_data(
    portfolio_id: str,
    metric_name: str,
    value: float = None,
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Returns raw JSON data arrays for the statistical distribution for a Portfolio."""
    from services.stats.fit_result import FitResult
    import numpy as np
    
    portfolio = get_portfolio_by_id(db, portfolio_id)
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")
        
    if not getattr(portfolio, "distribution_fit", None):
        fit = FitResult.empty(metric_name)
    else:
        fit_dict = portfolio.distribution_fit.get(metric_name)
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


@router.get("/{portfolio_id}/bayes")
def get_portfolio_bayes(
    portfolio_id: str,
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
    min_trades_ci: int = 30,
    ci_confidence: float = 0.95,
    bt_discount: float = 20.0,  # Internal constant — no longer user-configurable
    max_bt_trades: int = 30, # Max effective backtest trades cap (universal default)
    sim_pnl: Optional[str] = None,
    
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
    """Returns Bayesian EV decomposition for a portfolio.
    
    Aggregates BT PnL from all child strategies' equity curves,
    and live PnL from all their magic numbers.
    """
    from services.stats.fit_result import FitResult
    from services.stats.bayes_engine import BayesEngine
    from services.live_trades_service import LiveTradesService

    portfolio = get_portfolio_by_id(db, portfolio_id)
    if not portfolio:
        raise HTTPException(status_code=404, detail="Portfolio not found")

    strategies = db.query(Strategy).filter(
        Strategy.id.in_(portfolio.strategy_ids or [])
    ).all()

    # 1. BT PnL: extract from portfolio's merged equity curve
    trades_pnl = []
    equity_curve = getattr(portfolio, "equity_curve", None) or []
    if equity_curve and len(equity_curve) > 1:
        for i in range(1, len(equity_curve)):
            prev = equity_curve[i-1].get("equity", 0) if isinstance(equity_curve[i-1], dict) else equity_curve[i-1]
            curr = equity_curve[i].get("equity", 0) if isinstance(equity_curve[i], dict) else equity_curve[i]
            trades_pnl.append(curr - prev)

    bt_ev = round(float(sum(trades_pnl) / len(trades_pnl)), 4) if trades_pnl else 0.0

    # 2. Live PnL: aggregate chronologically from all child strategies
    live_trades_all = []
    for s in strategies:
        s_trades = LiveTradesService.get_live_trades(
            db,
            account_id=s.trading_account_id,
            magic_number=s.all_magic_numbers,
            start_date=s.start_date,
        )
        live_trades_all.extend(s_trades)
        
    # Sort all trades by close time so the portfolio equity curve reflects real-world sequence
    live_trades_all.sort(key=lambda t: t.close_time)
    live_pnls = [t.profit for t in live_trades_all]
    live_times = [t.close_time for t in live_trades_all]

    sim_pnls = []
    if sim_pnl:
        try:
            from datetime import timedelta, datetime
            last_t = live_times[-1] if live_times else datetime.now()
            tokens = [p.strip() for p in sim_pnl.split(",") if p.strip()]
            for p in tokens:
                sim_pnls.append(float(p))
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
                )
                last_p = round(tmp_decomp.p_positive * 100, 1) if tmp_decomp else None
            p_positive_curve.append(last_p)

    dist_fit = getattr(portfolio, "distribution_fit", None) or {}
    risk_config = getattr(portfolio, "risk_config", None) or {}

    # Calculate historical risk
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

    # 3. Bayesian EV Decomposition
    engine = BayesEngine()
    decomposition = engine.decompose_ev(
        bt_pnl=trades_pnl if trades_pnl else None,
        live_pnl=combined_live if combined_live else None,
        bt_discount=bt_discount,
        confidence=ci_confidence,
        min_trades=min_trades_ci,
        max_bt_trades=max_bt_trades if max_bt_trades > 0 else 30,
    )

    # 4. Fit types from portfolio's distribution_fit
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

    # 5. Risk gauges from heartbeat (computed as a true aggregated portfolio curve via compute_portfolio_current_values_from_db)
    risk_gauges = {}
    for metric_name in ["max_drawdown", "daily_loss", "stagnation_days", "stagnation_trades", "consecutive_losses"]:
        fit_dict = dist_fit.get(metric_name)
        cfg = risk_config.get(metric_name, {})
        current = cfg.get("current") if cfg else None
        
        if current is not None and fit_dict:
            from services.stats.gauge_evaluator import RiskGaugeEvaluator
            evaluator = RiskGaugeEvaluator(engine, risk_config)
            risk_gauges[metric_name] = evaluator.evaluate(
                metric_name=metric_name, 
                current_value=current, 
                fit_dict=fit_dict, 
                is_simulated=False
            )

    # 6. Consistency tests (BT vs Live)
    consistency_tests = {}
    if combined_live and trades_pnl:
        from scipy.stats import binom, norm
        
        live_wins = sum(1 for p in combined_live if p > 0)
        n_live = len(combined_live)
        bt_wr = sum(1 for p in trades_pnl if p > 0) / len(trades_pnl) if trades_pnl else 0.5
        
        p_wr = float(binom.cdf(live_wins, n_live, bt_wr))
        consistency_tests["win_rate"] = {
            "label": "Win Rate",
            "label_key": "winRate",
            "observed": f"{live_wins}/{n_live}",
            "expected": f"{bt_wr*100:.0f}%",
            "p_value": round(p_wr, 4),
            "status": "green" if p_wr > 0.10 else ("amber" if p_wr > 0.02 else "red"),
            "n": n_live, "k": live_wins, "bt_wr": round(bt_wr, 4),
        }

        # Consecutive losses
        max_streak = streak = 0
        for p in combined_live:
            if p <= 0: streak += 1; max_streak = max(max_streak, streak)
            else: streak = 0
        if max_streak > 0:
            p_raw = (1 - bt_wr) ** max_streak
            windows = max(1, n_live - max_streak + 1)
            p_streak = min(1.0, windows * p_raw)
            consistency_tests["consec_losses"] = {
                "label": "Racha Pérdidas",
                "label_key": "streak",
                "observed": f"{max_streak} seguidas",
                "expected": f"WR {bt_wr*100:.0f}%",
                "p_value": round(p_streak, 4),
                "status": "green" if p_streak > 0.10 else ("amber" if p_streak > 0.02 else "red"),
                "max_streak": max_streak,
                "loss_rate": round(1 - bt_wr, 4),
            }

        # PnL medio
        bt_avg = sum(trades_pnl) / len(trades_pnl)
        bt_std = (sum((p - bt_avg)**2 for p in trades_pnl) / len(trades_pnl)) ** 0.5
        live_avg = sum(combined_live) / n_live
        if bt_std > 0 and n_live > 0:
            se = bt_std / (n_live ** 0.5)
            z = (live_avg - bt_avg) / se
            p_pnl = float(norm.cdf(z))
            consistency_tests["avg_pnl"] = {
                "label": "PnL Medio",
                "label_key": "avgPnl",
                "observed": f"${live_avg:.1f}", "expected": f"${bt_avg:.1f}",
                "p_value": round(p_pnl, 4),
                "status": "green" if p_pnl > 0.10 else ("amber" if p_pnl > 0.02 else "red"),
                "z_score": round(z, 4),
            }

    # 7. Info report
    from services.risk_info_engine import RiskInfoEngine
    info_engine = RiskInfoEngine()
    info_report = info_engine.analyze(
        p_positive=decomposition.p_positive if decomposition else None,
        consistency_tests=consistency_tests,
        dd_percentile=risk_gauges.get("max_drawdown", {}).get("percentile"),
        live_trades=live_trades_total,
    )

    return {
        "strategy_id": portfolio_id,
        "total_trades": portfolio.total_trades,
        "bt_ev": bt_ev,
        "bt_trades": len(trades_pnl),
        "live_ev": live_ev,
        "live_trades_total": live_trades_total,
        "decomposition": decomposition.to_dict() if decomposition else None,
        "risk_gauges": risk_gauges,
        "fit_types": fit_types,
        "consistency_tests": consistency_tests,
        "live_equity_curve": cumulative_live,
        "p_positive_curve": p_positive_curve,
        "historical_risk": historical_risk,
        "info_report": info_report.to_dict(),
    }


from pydantic import BaseModel

class RecalculateAllRequest(BaseModel):
    trading_account_id: str

@router.post("/recalculate-all")
def recalculate_all_auto_portfolios(
    req: RecalculateAllRequest,
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Force recalculation of all auto-include (Default) portfolios for an account after bulk operations."""
    portfolios = db.query(Portfolio).filter(
        Portfolio.trading_account_id == req.trading_account_id,
        Portfolio.auto_include_new == True,
    ).all()
    
    count = 0
    for p in portfolios:
        recalculate_portfolio(db, p)
        count += 1
        
    return {"detail": f"Recalculated {count} auto-include portfolios"}

