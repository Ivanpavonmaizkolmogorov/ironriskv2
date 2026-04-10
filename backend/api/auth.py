"""Auth API routes — Login, Register, Token Management, Password Recovery."""

import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from jose import jwt, JWTError

from models.database import get_db, get_settings
from models.user import User
from schemas.auth import (
    RegisterRequest, LoginRequest, TokenResponse,
    UserResponse, ForgotPasswordRequest, ResetPasswordRequest
)
from services.auth_service import (
    register_user, authenticate_user, create_jwt, get_current_user,
    hash_password
)
from services.email_service import EmailService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/auth", tags=["Authentication"])


@router.post("/register", response_model=TokenResponse)
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    settings = get_settings()
    if settings.BETA_ACCESS_CODE and req.invite_code != settings.BETA_ACCESS_CODE:
        raise HTTPException(status_code=403, detail="Invalid Beta Access Code")

    user = register_user(db, req.email, req.password)

    # Synchronous email dispatch — caller gets feedback on success/failure
    email_svc = EmailService()
    email_ok = email_svc.send_welcome_email(user.email, locale=req.locale)
    if not email_ok:
        logger.warning(f"Welcome email failed for {user.email}, but account was created successfully.")

    token = create_jwt(user.id, user.email)
    return TokenResponse(access_token=token, email_sent=email_ok)


@router.post("/login", response_model=TokenResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = authenticate_user(db, req.email, req.password)
    token = create_jwt(user.id, user.email)
    return TokenResponse(access_token=token)


@router.get("/me", response_model=UserResponse)
def get_me(user: User = Depends(get_current_user)):
    return user


# ═══════════════════════════════════════════════════════════════════
# Password Recovery — Stateless JWT-based
# ═══════════════════════════════════════════════════════════════════

@router.post("/forgot-password")
def forgot_password(req: ForgotPasswordRequest, db: Session = Depends(get_db)):
    """
    If the email exists, sends a short-lived JWT reset link.
    Always returns 200 to prevent email enumeration attacks.
    """
    user = db.query(User).filter(User.email == req.email).first()

    if user:
        settings = get_settings()
        expire = datetime.now(timezone.utc) + timedelta(minutes=30)
        reset_payload = {
            "sub": user.id,
            "email": user.email,
            "purpose": "password_reset",
            "exp": expire,
        }
        reset_token = jwt.encode(
            reset_payload,
            settings.JWT_SECRET_KEY,
            algorithm=settings.JWT_ALGORITHM,
        )

        email_svc = EmailService()
        email_svc.send_password_reset_email(
            recipient_email=user.email,
            token=reset_token,
            locale=req.locale,
        )

    # Always return success to prevent email enumeration
    return {"detail": "If an account exists with that email, a recovery link has been sent."}


@router.post("/reset-password")
def reset_password(req: ResetPasswordRequest, db: Session = Depends(get_db)):
    """
    Validates the short-lived JWT token and resets the user's password.
    """
    settings = get_settings()
    try:
        payload = jwt.decode(
            req.token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
    except JWTError:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token.")

    if payload.get("purpose") != "password_reset":
        raise HTTPException(status_code=400, detail="Invalid token purpose.")

    user = db.query(User).filter(User.id == payload["sub"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    user.hashed_password = hash_password(req.new_password)
    db.commit()

    return {"detail": "Password has been successfully reset."}
