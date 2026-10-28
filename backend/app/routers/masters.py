from fastapi import APIRouter, Depends, HTTPException
from app.schemas import MasterOut
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Master, MasterService, User

router = APIRouter(prefix="/api/masters",tags=["masters"])


@router.get("", response_model = list[MasterOut])
def list_masters(branch_id: int | None = None, service_id: int | None = None, db:  Session = Depends(get_db)):
    query = (
        db.query(Master, User)
        .join(User, User.id == Master.user_id)
        .filter(Master.is_active == True)
    )
    if branch_id:
        query = query.filter(Master.branch_id == branch_id)
    if service_id:
        query = query.join(MasterService, MasterService.master_id == Master.id).filter(
            MasterService.service_id == service_id
        )

    result = []
    for master, user in query.order_by(User.full_name).all():
        result.append(
            MasterOut(
                id=master.id,
                full_name=user.full_name,
                branch_id=master.branch_id,
                level=master.level,
                bio=master.bio,
                photo_url=master.photo_url,
            )
        )
    return result


@router.get("/{master_id}", response_model = MasterOut)
def get_master(master_id: int, db: Session = Depends(get_db)):
    query = db.query(Master, User).join(User, User.id == Master.user_id).filter(Master.id == master_id)

    pair = query.first()
    if pair is None:
        raise HTTPException(status_code=404, detail="Мастер не найден")
    master, user = pair
    if not master.is_active:
        raise HTTPException(status_code=404, detail="Мастер не найден")

    return MasterOut(
        id=master.id,
        full_name=user.full_name,
        branch_id=master.branch_id,
        level=master.level,
        bio=master.bio,
        photo_url=master.photo_url,
    )
