from pydantic import BaseModel, ConfigDict, EmailStr, Field
from datetime import date, datetime, time
from decimal import Decimal
from typing import Literal

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

# Ответ GET /api/users/me — ещё и роль, чтобы фронтенд знал, какие разделы показывать
class UserMe(UserOut):
    role: str

# Тело PATCH /api/users/me — меняются только переданные поля
class UserUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=100)
    phone: str | None = None


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


# --- Администрирование справочников (тела POST и PUT) ---

class BranchIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    address: str = Field(min_length=1, max_length=255)
    phone: str | None = None

class CategoryIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)

class ServiceIn(BaseModel):
    category_id: int
    name: str = Field(min_length=1, max_length=100)
    description: str | None = None
    duration_min: int = Field(gt=0, le=600)
    base_price: Decimal = Field(gt=0)

Level = Literal["junior", "middle", "top"]

# Новый мастер: создаётся пользователь с ролью master и его профиль
class MasterCreate(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=72)
    full_name: str = Field(min_length=1, max_length=100)
    phone: str | None = None
    branch_id: int
    level: Level
    bio: str | None = None
    photo_url: str | None = None
    service_ids: list[int] = []

# Изменение мастера: можно передать не все поля
class MasterUpdate(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=100)
    branch_id: int | None = None
    level: Level | None = None
    bio: str | None = None
    photo_url: str | None = None
    service_ids: list[int] | None = None

class ShiftIn(BaseModel):
    work_date: date
    start_time: time
    end_time: time
    branch_id: int | None = None  # по умолчанию — филиал мастера

class ShiftOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    master_id: int
    branch_id: int
    work_date: date
    start_time: time
    end_time: time


# --- Записи ---

class AppointmentCreate(BaseModel):
    master_id: int
    service_ids: list[int] = Field(min_length=1)
    start_at: datetime
    comment: str | None = None

class AppointmentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    master_id: int
    branch_id: int
    start_at: datetime
    end_at: datetime
    status: str
    total_price: Decimal
    comment: str | None
    # заполняются в routers/appointments.py (with_details): кто придёт и на какие услуги
    client_name: str = ""
    client_phone: str | None = None
    services: list[str] = []

# Тело PATCH /api/appointments/{id}/status
class StatusUpdate(BaseModel):
    status: Literal["confirmed", "completed", "no_show"]


# --- Отзывы ---

class ReviewCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    text: str | None = None

class ReviewOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    appointment_id: int
    rating: int
    text: str | None
    created_at: datetime
