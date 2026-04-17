"""Trading Accounts API routes — CRUD for MT5 accounts and their tokens."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List

from models.database import get_db
from models.user import User
from schemas.trading_account import (
    CreateTradingAccountRequest, TradingAccountResponse, RevokeTradingAccountRequest,
    UpdateWorkspaceSettingsRequest,
)
from services.auth_service import get_current_user
from services.trading_account_service import (
    create_trading_account, get_user_trading_accounts, revoke_trading_account
)

router = APIRouter(prefix="/api/trading-accounts", tags=["Trading Accounts"])

@router.post("/", response_model=TradingAccountResponse)
def create_account(
    req: CreateTradingAccountRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return create_trading_account(db, user.id, req)

@router.get("/", response_model=List[TradingAccountResponse])
def list_accounts(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return get_user_trading_accounts(db, user.id)

@router.delete("/{account_id}")
def delete_account(
    account_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    revoke_trading_account(db, user.id, account_id)
    return {"detail": "Trading account revoked"}


@router.patch("/{account_id}/settings", response_model=TradingAccountResponse)
def update_workspace_settings(
    account_id: str,
    req: UpdateWorkspaceSettingsRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Update workspace-level settings (El Padre: master dashboard layout)."""
    from models.trading_account import TradingAccount
    from sqlalchemy.orm.attributes import flag_modified

    account = db.query(TradingAccount).filter(
        TradingAccount.id == account_id,
        TradingAccount.user_id == user.id
    ).first()
    if not account:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Trading account not found")

    if req.default_dashboard_layout is not None:
        account.default_dashboard_layout = req.default_dashboard_layout
        flag_modified(account, "default_dashboard_layout")

    if req.theme is not None:
        account.theme = req.theme

    if req.name is not None and req.name.strip():
        account.name = req.name.strip()

    db.commit()
    db.refresh(account)
    return account

@router.post("/{account_id}/rotate-token", response_model=TradingAccountResponse)
def rotate_workspace_token(
    account_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """The ultimate remote kill switch. Rotates the API token and clears heartbeat, 
    causing any ghost MetaTrader instances to receive HTTP 401 and auto-terminate."""
    import secrets
    from models.trading_account import TradingAccount

    account = db.query(TradingAccount).filter(
        TradingAccount.id == account_id,
        TradingAccount.user_id == user.id
    ).first()
    
    if not account:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Trading account not found")

    # Rotate the API token seamlessly
    account.api_token = f"irk_" + secrets.token_urlsafe(32)
    # Annihilate the connection history to instantly disconnect the frontend UI
    account.last_heartbeat_at = None
    account.has_connected = False
    
    db.commit()
    db.refresh(account)
    return account
