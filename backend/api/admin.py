"""Admin API — Feature Flags + User Management."""

from typing import List, Dict, Optional
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from models.database import get_db
from models.user import User
from models.feature_flag import FeatureFlag
from services.auth_service import get_current_user

router = APIRouter(prefix="/api/admin", tags=["Admin"])


def get_admin_user(user: User = Depends(get_current_user)) -> User:
    if not user.is_admin:
        raise HTTPException(status_code=403, detail="Not authorized. Admin privileges required.")
    return user


class FeatureFlagUpdate(BaseModel):
    tier: str  # "free", "pro", "enterprise"


# We want all users to be able to read feature flags to decide what to show
@router.get("/features", response_model=Dict[str, str])
def get_feature_flags(db: Session = Depends(get_db)):
    """Publicly accessible metadata for clients to configure UI."""
    flags = db.query(FeatureFlag).all()
    # Default return empty if none set
    return {f.key: f.tier for f in flags}


# Only admin can create or update feature flags
@router.patch("/features/{key}")
def update_feature_flag(
    key: str, 
    update: FeatureFlagUpdate, 
    db: Session = Depends(get_db), 
    admin: User = Depends(get_admin_user)
):
    """Admin-only: Create or update a feature flag tier."""
    if update.tier not in ["free", "pro", "enterprise"]:
        raise HTTPException(status_code=400, detail="Invalid tier")
        
    flag = db.query(FeatureFlag).filter(FeatureFlag.key == key).first()
    
    if flag:
        flag.tier = update.tier
    else:
        # Create it if it doesn't exist yet
        flag = FeatureFlag(key=key, tier=update.tier, label=key)
        db.add(flag)
        
    db.commit()
    return {"key": key, "tier": update.tier}


# ─────────────────────────────────────────────
# User Management (Admin-only)
# ─────────────────────────────────────────────

class AdminUserResponse(BaseModel):
    id: str
    email: str
    is_admin: bool
    created_at: Optional[datetime] = None
    trading_accounts_count: int = 0
    strategies_count: int = 0

    class Config:
        from_attributes = True


class AdminUserUpdate(BaseModel):
    is_admin: Optional[bool] = None
    password: Optional[str] = None


@router.get("/users", response_model=List[AdminUserResponse])
def list_users(
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """List all registered users with account/strategy counts."""
    from models.trading_account import TradingAccount
    from models.strategy import Strategy

    users = db.query(User).order_by(User.created_at.desc()).all()
    result = []
    for u in users:
        acc_count = db.query(TradingAccount).filter(TradingAccount.user_id == u.id).count()
        # Count strategies across all accounts
        strat_count = (
            db.query(Strategy)
            .join(TradingAccount, Strategy.trading_account_id == TradingAccount.id)
            .filter(TradingAccount.user_id == u.id)
            .count()
        )
        result.append(AdminUserResponse(
            id=u.id,
            email=u.email,
            is_admin=u.is_admin,
            created_at=u.created_at,
            trading_accounts_count=acc_count,
            strategies_count=strat_count,
        ))
    return result


@router.delete("/users/{user_id}")
def delete_user(
    user_id: str,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Cascade-delete a user and all their data (accounts, strategies, preferences)."""
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own admin account.")

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    email = user.email
    db.delete(user)  # SQLAlchemy cascade handles trading_accounts → strategies
    db.commit()
    return {"detail": f"User {email} and all associated data deleted."}


@router.patch("/users/{user_id}", response_model=AdminUserResponse)
def update_user(
    user_id: str,
    update: AdminUserUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(get_admin_user),
):
    """Update user flags (e.g. promote to admin)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    if update.is_admin is not None:
        user.is_admin = update.is_admin

    if update.password is not None and update.password.strip():
        from services.auth_service import hash_password
        user.hashed_password = hash_password(update.password)

    db.commit()
    db.refresh(user)

    from models.trading_account import TradingAccount
    from models.strategy import Strategy
    acc_count = db.query(TradingAccount).filter(TradingAccount.user_id == user.id).count()
    strat_count = (
        db.query(Strategy)
        .join(TradingAccount, Strategy.trading_account_id == TradingAccount.id)
        .filter(TradingAccount.user_id == user.id)
        .count()
    )

    return AdminUserResponse(
        id=user.id,
        email=user.email,
        is_admin=user.is_admin,
        created_at=user.created_at,
        trading_accounts_count=acc_count,
        strategies_count=strat_count,
    )

