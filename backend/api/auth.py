"""Auth API routes — Login, Register, Email Verification, Password Recovery."""

import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
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


def _create_verification_token(user_id: str, email: str) -> str:
    """Create a short-lived JWT for email verification (24h TTL)."""
    settings = get_settings()
    expire = datetime.now(timezone.utc) + timedelta(hours=24)
    payload = {
        "sub": user_id,
        "email": email,
        "purpose": "email_verification",
        "exp": expire,
    }
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


@router.post("/register", response_model=TokenResponse)
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    settings = get_settings()
    if settings.BETA_ACCESS_CODE and req.invite_code != settings.BETA_ACCESS_CODE:
        raise HTTPException(status_code=403, detail="Invalid Beta Access Code")

    user = register_user(db, req.email, req.password)
    token = create_jwt(user.id, user.email)

    # Send verification email (fire-and-forget in background thread)
    import threading
    def _send_emails():
        try:
            email_svc = EmailService()
            verify_token = _create_verification_token(user.id, user.email)
            ok = email_svc.send_verification_email(user.email, verify_token, locale=req.locale)
            if not ok:
                logger.warning(f"Verification email failed for {user.email}, account created OK.")
        except Exception as e:
            logger.error(f"Verification email exception for {user.email}: {e}")
    threading.Thread(target=_send_emails, daemon=True).start()

    return TokenResponse(access_token=token, email_sent=True)


@router.post("/login", response_model=TokenResponse)
def login(req: LoginRequest, db: Session = Depends(get_db)):
    try:
        user = authenticate_user(db, req.email, req.password)
    except HTTPException:
        # Check if this email is on the waitlist (not yet a real account)
        from models.waitlist import WaitlistLead
        email = req.email.strip().lower()
        lead = db.query(WaitlistLead).filter(WaitlistLead.email == email).first()
        if lead:
            if lead.approved_at:
                raise HTTPException(
                    status_code=401,
                    detail="Tu acceso ha sido aprobado. Busca el email de acceso en tu bandeja (revisa spam también)."
                    if req.locale == "es" else
                    "Your access has been approved. Check your inbox for the access email (check spam too)."
                )
            raise HTTPException(
                status_code=401,
                detail="Estás en lista de espera. Te avisaremos cuando tu acceso esté activado."
                if req.locale == "es" else
                "You're on the waitlist. We'll email you when your access is activated."
            )
        raise

    token = create_jwt(user.id, user.email)
    return TokenResponse(access_token=token)



@router.get("/me", response_model=UserResponse)
def get_me(user: User = Depends(get_current_user)):
    return user


# ═══════════════════════════════════════════════════════════════════
# Email Verification
# ═══════════════════════════════════════════════════════════════════

@router.get("/verify-email")
def verify_email(token: str, db: Session = Depends(get_db)):
    """
    Validates the verification JWT and marks the user's email as verified.
    Redirects to the frontend login page with a success indicator.
    """
    settings = get_settings()
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
        )
    except JWTError:
        raise HTTPException(status_code=400, detail="Invalid or expired verification link.")

    if payload.get("purpose") != "email_verification":
        raise HTTPException(status_code=400, detail="Invalid token purpose.")

    user = db.query(User).filter(User.id == payload["sub"]).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    if not user.email_verified:
        user.email_verified = True
        db.commit()
        logger.info(f"✅ Email verified for {user.email}")

    # Redirect to frontend login with verified flag
    settings = get_settings()
    frontend_url = getattr(settings, "FRONTEND_URL", "https://www.ironrisk.pro")
    return RedirectResponse(url=f"{frontend_url}/es/login?verified=true")


@router.post("/resend-verification")
def resend_verification(user: User = Depends(get_current_user)):
    """
    Resend verification email for the currently authenticated user.
    Requires a valid JWT (user is logged in but not verified).
    """
    if user.email_verified:
        return {"detail": "Email already verified."}

    verify_token = _create_verification_token(user.id, user.email)

    import threading
    def _send():
        try:
            email_svc = EmailService()
            email_svc.send_verification_email(user.email, verify_token, locale="es")
        except Exception as e:
            logger.error(f"Resend verification failed for {user.email}: {e}")
    threading.Thread(target=_send, daemon=True).start()

    return {"detail": "Verification email sent."}


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


# ══════════════════════════════════════════════════════════════════════
# Magic Link Access — creates account from approved waitlist token
# ══════════════════════════════════════════════════════════════════════

class MagicLinkRequest(BaseModel):
    token: str


@router.post("/magic", response_model=TokenResponse)
def magic_link_auth(req: MagicLinkRequest, db: Session = Depends(get_db)):
    """
    Validates a magic access token (generated on waitlist approval).
    - If user already exists → logs them in.
    - If not → creates the account with stored password_hash → logs in.
    """
    from models.waitlist import WaitlistLead
    from models.trading_account import TradingAccount

    settings = get_settings()

    try:
        payload = jwt.decode(
            req.token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
            options={"verify_exp": False},  # magic links never expire
        )
    except JWTError:
        raise HTTPException(status_code=400, detail="Invalid magic link.")

    if payload.get("purpose") != "magic_access":
        raise HTTPException(status_code=400, detail="Invalid token purpose.")

    email = payload.get("email", "").strip().lower()
    if not email:
        raise HTTPException(status_code=400, detail="Malformed token.")

    # If user already exists — just log them in
    existing_user = db.query(User).filter(User.email == email).first()
    if existing_user:
        token = create_jwt(existing_user.id, existing_user.email)
        return TokenResponse(access_token=token)

    # Find waitlist lead to get stored password_hash
    lead = db.query(WaitlistLead).filter(WaitlistLead.email == email).first()
    if not lead or not lead.password_hash:
        raise HTTPException(
            status_code=400,
            detail="Waitlist entry not found or no password stored. Please re-register."
        )

    # Create the user with stored password hash (already hashed)
    import uuid as _uuid
    new_user = User(
        id=str(_uuid.uuid4()),
        email=email,
        hashed_password=lead.password_hash,
        email_verified=True,  # magic link = verified email
        is_admin=False,
    )
    db.add(new_user)

    # Auto-create a default workspace
    default_ws = TradingAccount(
        id=str(_uuid.uuid4()),
        user_id=new_user.id,
        name="Mi Cuenta Principal",
        account_number="",
        broker="",
    )
    db.add(default_ws)
    db.commit()

    token = create_jwt(new_user.id, new_user.email)
    return TokenResponse(access_token=token)

