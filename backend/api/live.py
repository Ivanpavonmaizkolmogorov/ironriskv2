"""Live API routes — EA heartbeat endpoint (API Token auth, no JWT)."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from models.database import get_db
from schemas.live import HeartbeatRequest, HeartbeatResponse
from services.auth_service import validate_api_token
from services.strategy_service import get_strategy_by_magic
from core.risk_engine import RiskEngine

router = APIRouter(prefix="/api/live", tags=["Live EA"])


@router.post("/heartbeat", response_model=HeartbeatResponse)
def heartbeat(req: HeartbeatRequest, db: Session = Depends(get_db)):
    """Receive live PnL from EA → return risk status.

    Authentication: via api_token in the request body (no JWT needed).
    The EA sends this every N seconds with current PnL state.
    """
    # 1. Validate API token → get user
    api_token = validate_api_token(db, req.api_token)

    # 2. Find strategy by magic number for this user
    strategy = get_strategy_by_magic(db, api_token.user_id, req.magic_number)

    # 3. Check if we have backtest params
    if not strategy.metrics_snapshot:
        return HeartbeatResponse(
            status="NORMAL",
            metrics=[],
            floor_level=0.0,
            ceiling_level=0.0,
        )

    # 4. Run RiskEngine live evaluation
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
    return HeartbeatResponse(**response)


@router.get("/status/{api_token}/{magic_number}")
def get_status(api_token: str, magic_number: int, db: Session = Depends(get_db)):
    """Simple GET endpoint for quick status checks from EA."""
    token_obj = validate_api_token(db, api_token)
    strategy = get_strategy_by_magic(db, token_obj.user_id, magic_number)

    if not strategy.metrics_snapshot:
        return {"status": "NO_DATA", "strategy": strategy.name}

    return {
        "status": "ACTIVE",
        "strategy": strategy.name,
        "total_trades": strategy.total_trades,
        "max_drawdown_limit": strategy.max_drawdown_limit,
        "daily_loss_limit": strategy.daily_loss_limit,
    }
