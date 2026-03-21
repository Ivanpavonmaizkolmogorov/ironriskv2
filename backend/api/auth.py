"""Auth API routes — Login, Register, Token Management."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List

from models.database import get_db
from models.user import User
from schemas.auth import (
    RegisterRequest, LoginRequest, TokenResponse,
    UserResponse
)
from services.auth_service import (
    register_user, authenticate_user, create_jwt, get_current_user
)

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.post("/register", response_model=TokenResponse)
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    user = register_user(db, req.email, req.password)
    token = create_jwt(user.id, user.email)
    return TokenResponse(access_token=token)


@router.post("/login", response_model=TokenResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = authenticate_user(db, req.email, req.password)
    token = create_jwt(user.id, user.email)
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserResponse)
def get_me(user: User = Depends(get_current_user)):
    return user


# --- API Token Management removed (now in trading_accounts API) ---
