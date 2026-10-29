from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.schemas import UserMe, UserUpdate
from app.security import get_current_user, get_role_name

router = APIRouter(prefix="/api/users", tags=["users"])


def to_me(user, db):
    return UserMe(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        phone=user.phone,
        created_at=user.created_at,
        role=get_role_name(user, db),
    )


@router.get("/me", response_model=UserMe)
def get_me(user=Depends(get_current_user), db: Session = Depends(get_db)):
    return to_me(user, db)


@router.patch("/me", response_model=UserMe)
def update_me(data: UserUpdate, user=Depends(get_current_user), db: Session = Depends(get_db)):
    # exclude_unset — только поля, которые клиент действительно прислал
    for field, value in data.model_dump(exclude_unset=True).items():
        if field == "full_name" and value is None:
            continue
        setattr(user, field, value)
    db.commit()
    db.refresh(user)
    return to_me(user, db)
