from pydantic import BaseModel, ConfigDict, EmailStr, Field
from datetime import datetime
from decimal import Decimal

# --- Авторизация ---

# Тело POST /api/auth/register
class UserRegister(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)  # bcrypt учитывает только 72 байта
    full_name: str = Field(min_length=1, max_length=100)
    phone: str | None = None

# Тело POST /api/auth/login
class UserLogin(BaseModel):
    email: EmailStr
    password: str

# Тело POST /api/auth/refresh
class RefreshRequest(BaseModel):
    refresh_token: str

# Ответ на login и refresh
class TokenPair(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"

# Как пользователь показывается в ответах (без password_hash и token_version)
class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: str
    full_name: str
    phone: str | None
    created_at: datetime


# --- Каталог ---

# Филиал в ответе GET /api/branches (is_active не отдаём — гость видит только работающие)
class BranchOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    address: str
    phone: str | None

class CategoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str

class ServiceOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    category_id: int
    name: str
    description: str | None
    duration_min: int
    base_price: Decimal

class MasterOut(BaseModel):
    id: int
    full_name: str
    branch_id: int
    level: str
    bio: str | None
    photo_url: str | None
