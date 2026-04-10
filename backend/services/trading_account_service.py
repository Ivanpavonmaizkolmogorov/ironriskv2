"""Trading Account service — managing MT5 accounts and their API tokens."""

from sqlalchemy.orm import Session
from fastapi import HTTPException
import logging

from models.trading_account import TradingAccount
from schemas.trading_account import CreateTradingAccountRequest

logger = logging.getLogger("ironrisk")

def create_trading_account(db: Session, user_id: str, data: CreateTradingAccountRequest) -> TradingAccount:
    account = TradingAccount(
        user_id=user_id,
        name=data.name,
        broker=data.broker,
        account_number=data.account_number
    )
    db.add(account)
    db.commit()
    db.refresh(account)
    return account

def get_user_trading_accounts(db: Session, user_id: str):
    return db.query(TradingAccount).filter(TradingAccount.user_id == user_id).all()

def get_trading_account_by_id(db: Session, account_id: str, user_id: str) -> TradingAccount:
    account = db.query(TradingAccount).filter(
        TradingAccount.id == account_id, TradingAccount.user_id == user_id
    ).first()
    if not account:
        raise HTTPException(status_code=404, detail="Trading account not found")
    return account

def validate_api_token(db: Session, token_str: str) -> TradingAccount:
    """Validate an API token (used by EA — no JWT)."""
    account = db.query(TradingAccount).filter(
        TradingAccount.api_token == token_str, TradingAccount.is_active == True
    ).first()
    if not account:
        raise HTTPException(status_code=401, detail="Invalid or revoked API token")
    return account

def revoke_trading_account(db: Session, user_id: str, account_id: str) -> None:
    account = get_trading_account_by_id(db, account_id, user_id)
    # Hard delete — cascade will remove strategies, trades, etc.
    db.delete(account)
    db.commit()
