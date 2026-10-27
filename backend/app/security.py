from datetime import datetime,timedelta, timezone
import jwt
from pwdlib import PasswordHash
from pwdlib.hashers.bcrypt import BcryptHasher
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer
from sqlalchemy.orm import Session

from app.config import ACCESS_TOKEN_MINUTES, REFRESH_TOKEN_DAYS, SECRET_KEY
from app.database import get_db
from app.models import User, Role

password_hash = PasswordHash([BcryptHasher()])
bearer = HTTPBearer()

def hash_password(password):
    return password_hash.hash(password)

def verify_password(password, hashed):
    return password_hash.verify(password, hashed)

def create_token(user, token_type):
    if token_type == "access":
        expires = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_MINUTES)
    else:
        expires = datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_DAYS)

    payload = {
        "sub": str(user.id),
        "ver": user.token_version,
        "type": token_type,
        "exp": expires,
    }
    return jwt.encode(payload, SECRET_KEY, algorithm="HS256")

def get_user_from_token(token, token_type, db):
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
    except jwt.PyJWTError:
        raise HTTPException(status_code=401, detail="Неверный или просроченный токен")

    if payload["type"] != token_type:
        raise HTTPException(status_code=401, detail="Неверный тип токена")

    user = db.query(User).filter(User.id == int(payload["sub"])).first()

    if user is None or user.token_version != payload["ver"]:
        raise HTTPException(status_code=401, detail="Токен больше не действует")

    return user

def get_current_user(credentials=Depends(bearer), db: Session = Depends(get_db)):
    return get_user_from_token(credentials.credentials, "access", db)

def get_role_name(user, db):
    role = db.query(Role).filter(Role.id == user.role_id).first()
    return role.name

def require_admin(user=Depends(get_current_user), db: Session = Depends(get_db)):
    if get_role_name(user, db) != "admin":
        raise HTTPException(status_code=403, detail="Доступно только администратору")
    return user

def require_master_or_admin(user=Depends(get_current_user), db: Session = Depends(get_db)):
    if get_role_name(user, db) not in ("master", "admin"):
        raise HTTPException(status_code=403, detail="Доступно мастеру или администратору")
    return user
