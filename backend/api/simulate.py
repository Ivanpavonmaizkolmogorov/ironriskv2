"""Public Simulation API — No auth required."""

from fastapi import APIRouter, HTTPException, UploadFile, File, Form
import json

from schemas.simulate import SimulateRequest, SimulateResponse
from services.simulation_service import SimulationService
from services.csv_parser import parse_csv

router = APIRouter(prefix="/api/simulate", tags=["Simulate"])

@router.post("/", response_model=SimulateResponse)
def run_simulation(req: SimulateRequest):
    try:
        if req.csv_pnl is not None and len(req.csv_pnl) > 0:
            decomp, stats = SimulationService.from_csv_pnl(req.csv_pnl)
        else:
            if req.win_rate is None or req.n_trades is None or req.avg_win is None or req.avg_loss is None:
                raise HTTPException(status_code=400, detail="Missing required manual parameters")
            decomp, stats = SimulationService.from_manual_params(req)

        if decomp is None:
            raise HTTPException(status_code=400, detail="Unable to compute EV decomposition from stats")

        curve = SimulationService.generate_density_curve(decomp)
        paths = SimulationService.generate_equity_paths(decomp)
        risk_suggestions = SimulationService.extract_risk_suggestions(paths, stats)

        return SimulateResponse(
            decomposition=decomp.to_dict(),
            density_curve=curve,
            equity_paths=paths,
            extracted_stats=stats,
            risk_suggestions=risk_suggestions,
        )

    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Simulation error: {str(e)}")

@router.post("/upload", response_model=SimulateResponse)
async def run_simulation_from_file(
    file: UploadFile = File(...),
    column_mapping: str = Form(None)
):
    """Accepts a MetaTrader CSV/HTML, parses it correctly, and simulates the edge."""
    try:
        content = await file.read()
        
        mapping_dict = None
        if column_mapping:
            try:
                mapping_dict = json.loads(column_mapping)
            except json.JSONDecodeError:
                pass
                
        from core.risk_engine import RiskEngine
        from services.csv_parser import parse_csv
        
        trades, summary = parse_csv(content, filename=file.filename, column_mapping=mapping_dict)
        
        # Extract the sequence of PnL values identically to csvPnl logic but using parsed accurate data
        csv_pnl = [t["pnl"] for t in trades]
        
        if not csv_pnl:
            raise ValueError("No positive or negative profit found in parsed CSV")
            
        decomp, stats = SimulationService.from_csv_pnl(csv_pnl)

        if decomp is None:
            raise HTTPException(status_code=400, detail="Unable to compute EV decomposition from stats")

        curve = SimulationService.generate_density_curve(decomp)
        paths = SimulationService.generate_equity_paths(decomp)
        
        # Calculate EXACT historical metrics instead of Monte Carlo suggestions
        engine = RiskEngine.create_default()
        metrics_snapshot = engine.analyze_backtest(trades)
        
        dd_params = metrics_snapshot.get("DrawdownMetric", {})
        cl_params = metrics_snapshot.get("ConsecutiveLossesMetric", {})
        st_params = metrics_snapshot.get("StagnationTradesMetric", {})
        sd_params = metrics_snapshot.get("StagnationDaysMetric", {})
        
        ev_per_t = stats.get("avg_win", 0) * stats.get("win_rate", 0) - stats.get("avg_loss", 0) * (1 - stats.get("win_rate", 0))

        actual_risk_suggestions = {
            "max_drawdown": dd_params.get("max_drawdown", 0.0),
            "daily_loss": summary.get("worst_daily_loss", 0.0),
            "consecutive_losses": cl_params.get("max_consecutive_losses", 0),
            "stagnation_trades": st_params.get("max_stagnation_trades", 0),
            "stagnation_days": sd_params.get("max_stagnation_days", 0),
            "ev_per_trade": ev_per_t,
            "confidence_note": "Extracted exact metrics from historical backtest.",
        }

        return SimulateResponse(
            decomposition=decomp.to_dict(),
            density_curve=curve,
            equity_paths=paths,
            extracted_stats=stats,
            risk_suggestions=actual_risk_suggestions,
            equity_curve=summary.get("equity_curve"),
            last_trade_date=summary.get("last_trade_date"),
        )

    except ValueError as e:
        import traceback
        traceback.print_exc()
        
        # Dump for debugging
        try:
            with open('failed_html_debug.bin', 'wb') as f:
                f.write(content)
        except Exception:
            pass
            
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=500, detail=f"Simulation file error: {str(e)}")

@router.post("/extract_headers")
async def extract_headers_endpoint(file: UploadFile = File(...)):
    """Extracts raw headers from an uploaded CSV, Excel, or HTML file."""
    try:
        content = await file.read()
        from services.csv_parser import extract_file_headers
        headers = extract_file_headers(content, file.filename)
        return {"headers": headers}
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(status_code=400, detail=f"Error reading headers: {str(e)}")
