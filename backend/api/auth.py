"""Auth API routes — Login, Register, Token Management."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List

from models.database import get_db
from models.user import User
from schemas.auth import (
    RegisterRequest, LoginRequest, TokenResponse,
    UserResponse, CreateAPITokenRequest, APITokenResponse,
)
from services.auth_service import (
    register_user, authenticate_user, create_jwt,
    get_current_user, create_api_token, revoke_api_token, get_user_tokens,
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


# --- API Token Management (for EA) ---

@router.post("/tokens", response_model=APITokenResponse)
def create_token(
    req: CreateAPITokenRequest,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return create_api_token(db, user.id, req.label)


@router.get("/tokens", response_model=List[APITokenResponse])
def list_tokens(
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return get_user_tokens(db, user.id)


@router.delete("/tokens/{token_id}")
def delete_token(
    token_id: str,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    revoke_api_token(db, user.id, token_id)
    return {"detail": "Token revoked"}
