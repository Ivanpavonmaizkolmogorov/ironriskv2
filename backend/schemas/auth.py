"""Pydantic schemas for authentication requests/responses."""

from pydantic import BaseModel, EmailStr


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str
    locale: str = "es"
    invite_code: str | None = None


class LoginRequest(BaseModel):
    email: EmailStr
    password: str
    locale: str = "es"


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    email_sent: bool | None = None


class UserResponse(BaseModel):
    id: str
    email: str
    is_admin: bool = False
    email_verified: bool = False

    class Config:
        from_attributes = True


class ForgotPasswordRequest(BaseModel):
    email: EmailStr
    locale: str = "es"


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str
