from fastapi import APIRouter, Depends, HTTPException, Query
from app.schemas import MasterOut
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Master, MasterService, User, Service, WorkShift
from app.config import TZ
from datetime import date, datetime, timedelta

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

@router.get("/{master_id}/slots", response_model=list[datetime])
def get_slot(date: date, master_id: int, service_ids: list[int] = Query(), db: Session = Depends(get_db)):
    master = db.query(Master).filter(Master.id == master_id).first()

    if master is None or master.is_active == False:
        raise HTTPException(status_code=404, detail="Мастер не найден")

    master_service = (
        db.query(Service)
        .join(MasterService, MasterService.service_id == Service.id)
        .filter(MasterService.master_id == master_id)
        .filter(Service.id.in_(service_ids))
        .filter(Service.is_active == True)
        .all()
    )

    if len(master_service) != len(service_ids):
        raise HTTPException(status_code=422, detail="Мастер не оказывает выбранные услуги")

    duration = timedelta(minutes = sum(s.duration_min for s in master_service))
    shift = db.query(WorkShift).filter(WorkShift.master_id == master_id).filter(WorkShift.work_date == date).first()

    if shift is None:
        return []

    start = datetime.combine(date, shift.start_time, tzinfo=TZ)
    end = datetime.combine(date, shift.end_time, tzinfo=TZ)
    step = timedelta(minutes=15)

    slots = []
    while start + duration <= end:
        slots.append(start)
        start = start + step
    return slots
