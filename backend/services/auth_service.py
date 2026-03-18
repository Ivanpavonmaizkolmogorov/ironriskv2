"""Authentication service — JWT generation, password hashing, user CRUD."""

from datetime import datetime, timedelta, timezone

from jose import jwt, JWTError
from passlib.context import CryptContext
from sqlalchemy.orm import Session
from fastapi import HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

from models.database import get_db, get_settings
from models.user import User
from models.api_token import APIToken

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_jwt(user_id: str, email: str) -> str:
    settings = get_settings()
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_EXPIRATION_MINUTES)
    payload = {"sub": user_id, "email": email, "exp": expire}
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)


def decode_jwt(token: str) -> dict:
    settings = get_settings()
    try:
        return jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


def register_user(db: Session, email: str, password: str) -> User:
    existing = db.query(User).filter(User.email == email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(email=email, hashed_password=hash_password(password))
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def authenticate_user(db: Session, email: str, password: str) -> User:
    user = db.query(User).filter(User.email == email).first()
    if not user or not verify_password(password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return user


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    """FastAPI dependency — extracts user from JWT in Authorization header."""
    payload = decode_jwt(credentials.credentials)
    user = db.query(User).filter(User.id == payload["sub"]).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


# --- API Token Operations ---

def create_api_token(db: Session, user_id: str, label: str = "Default") -> APIToken:
    token = APIToken(user_id=user_id, label=label)
    db.add(token)
    db.commit()
    db.refresh(token)
    return token


def revoke_api_token(db: Session, user_id: str, token_id: str) -> None:
    token = db.query(APIToken).filter(
        APIToken.id == token_id, APIToken.user_id == user_id
    ).first()
    if not token:
        raise HTTPException(status_code=404, detail="Token not found")
    token.is_active = False
    db.commit()


def get_user_tokens(db: Session, user_id: str):
    return db.query(APIToken).filter(APIToken.user_id == user_id).all()


def validate_api_token(db: Session, token_str: str) -> APIToken:
    """Validate an API token (used by EA — no JWT)."""
    token = db.query(APIToken).filter(
        APIToken.token == token_str, APIToken.is_active == True
    ).first()
    if not token:
        raise HTTPException(status_code=401, detail="Invalid or revoked API token")
    return token
