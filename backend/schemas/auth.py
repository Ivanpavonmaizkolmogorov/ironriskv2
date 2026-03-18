"""Pydantic schemas for authentication requests/responses."""

from pydantic import BaseModel, EmailStr


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: str
    email: str

    class Config:
        from_attributes = True


# --- API Token Management ---

class CreateAPITokenRequest(BaseModel):
    label: str = "Default"


class APITokenResponse(BaseModel):
    id: str
    token: str
    label: str
    is_active: bool

    class Config:
        from_attributes = True


class RevokeTokenRequest(BaseModel):
    token_id: str
