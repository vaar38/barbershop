from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Role, User
from app.security import create_token, get_current_user, get_user_from_token, hash_password, verify_password
from app.schemas import RefreshRequest, TokenPair, UserLogin, UserOut, UserRegister

router = APIRouter(prefix="/api/auth", tags=["auth"])

@router.post("/register", response_model= UserOut, status_code=201)
def register(data: UserRegister, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == data.email).first()
    if existing:
        raise HTTPException(status_code=409, detail="Пользователь с таким email уже есть")

    client_role = db.query(Role).filter(Role.name == "client").first()

    user = User(
        email = data.email,
        password_hash = hash_password(data.password),
        full_name = data.full_name,
        phone = data.phone,
        role_id = client_role.id,
    )

    db.add(user)
    db.commit()
    db.refresh(user)
    return user

@router.post("/login", response_model=TokenPair)
def login(data: UserLogin, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == data.email).first()
    if user is None or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Неверный email или пароль")
    return {"access_token": create_token(user, "access"),
            "refresh_token": create_token(user, "refresh")}

@router.post("/refresh", response_model=TokenPair)
def refresh(data: RefreshRequest, db: Session = Depends(get_db)):
    user = get_user_from_token(data.refresh_token, "refresh", db)

    return {"access_token": create_token(user, "access"),
            "refresh_token": create_token(user, "refresh")}

@router.post("/logout", status_code=204)
def logout(user=Depends(get_current_user), db: Session = Depends(get_db)):
    user.token_version = user.token_version + 1
    db.commit()
