"""Trading Accounts API routes — CRUD for MT5 accounts and their tokens."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List

from models.database import get_db
from models.user import User
from schemas.trading_account import (
    CreateTradingAccountRequest, TradingAccountResponse, RevokeTradingAccountRequest
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
