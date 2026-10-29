from fastapi import APIRouter, Depends, HTTPException, Query
from app.schemas import MasterCreate, MasterOut, MasterUpdate, ReviewOut, ShiftIn, ShiftOut
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Appointment, Branch, Master, MasterService, Review, Role, User, Service, WorkShift
from app.config import TZ
from app.security import get_current_user, get_role_name, hash_password, require_admin
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

    busy = (
        db.query(Appointment)
        .filter(Appointment.master_id == master_id)
        .filter(Appointment.status.in_(["pending","confirmed"]))
        .filter(Appointment.start_at < end, Appointment.end_at > start)
        .all()
    )
    now = datetime.now(TZ)

    slots = []
    while start + duration <= end:
        slot_end = start + duration
        is_busy = any(start < a.end_at and slot_end > a.start_at for a in busy)
        if start > now and not is_busy:
            slots.append(start)
        start = start + step
    return slots


@router.get("/{master_id}/reviews", response_model=list[ReviewOut])
def list_reviews(master_id: int, db: Session = Depends(get_db)):
    # отзыв привязан к записи, а запись — к мастеру
    return (
        db.query(Review)
        .join(Appointment, Appointment.id == Review.appointment_id)
        .filter(Appointment.master_id == master_id)
        .order_by(Review.created_at.desc())
        .all()
    )


# --- Администратор: мастера ---

def master_out(master, user):
    return MasterOut(
        id=master.id,
        full_name=user.full_name,
        branch_id=master.branch_id,
        level=master.level,
        bio=master.bio,
        photo_url=master.photo_url,
    )


def check_branch(branch_id, db):
    branch = db.query(Branch).filter(Branch.id == branch_id, Branch.is_active == True).first()
    if branch is None:
        raise HTTPException(status_code=422, detail="Филиал не найден")


def set_services(master, service_ids, db):
    found = db.query(Service).filter(Service.id.in_(service_ids)).count()
    if found != len(set(service_ids)):
        raise HTTPException(status_code=422, detail="Некоторые услуги не найдены")
    db.query(MasterService).filter(MasterService.master_id == master.id).delete()
    for service_id in set(service_ids):
        db.add(MasterService(master_id=master.id, service_id=service_id))


@router.post("", response_model=MasterOut, status_code=201)
def create_master(data: MasterCreate, admin=Depends(require_admin), db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == data.email).first():
        raise HTTPException(status_code=409, detail="Пользователь с таким email уже есть")
    check_branch(data.branch_id, db)

    role = db.query(Role).filter(Role.name == "master").first()
    user = User(
        role_id=role.id,
        email=data.email,
        password_hash=hash_password(data.password),
        full_name=data.full_name,
        phone=data.phone,
    )
    db.add(user)
    db.flush()

    master = Master(user_id=user.id, branch_id=data.branch_id, level=data.level, bio=data.bio, photo_url=data.photo_url)
    db.add(master)
    db.flush()
    set_services(master, data.service_ids, db)

    db.commit()
    return master_out(master, user)


@router.put("/{master_id}", response_model=MasterOut)
def update_master(master_id: int, data: MasterUpdate, admin=Depends(require_admin), db: Session = Depends(get_db)):
    master = db.query(Master).filter(Master.id == master_id).first()
    if master is None:
        raise HTTPException(status_code=404, detail="Мастер не найден")
    user = db.query(User).filter(User.id == master.user_id).first()

    fields = data.model_dump(exclude_unset=True)
    if fields.get("full_name"):
        user.full_name = fields["full_name"]
    if fields.get("branch_id"):
        check_branch(fields["branch_id"], db)
        master.branch_id = fields["branch_id"]
    if fields.get("level"):
        master.level = fields["level"]
    if "bio" in fields:
        master.bio = fields["bio"]
    if "photo_url" in fields:
        master.photo_url = fields["photo_url"]
    if fields.get("service_ids") is not None:
        set_services(master, fields["service_ids"], db)

    db.commit()
    return master_out(master, user)


@router.delete("/{master_id}", status_code=204)
def delete_master(master_id: int, admin=Depends(require_admin), db: Session = Depends(get_db)):
    # Мастера не удаляем: на него ссылаются записи и отзывы. Просто выключаем
    master = db.query(Master).filter(Master.id == master_id).first()
    if master is None:
        raise HTTPException(status_code=404, detail="Мастер не найден")
    master.is_active = False
    db.commit()


# --- Смены ---

@router.get("/{master_id}/shifts", response_model=list[ShiftOut])
def list_shifts(
    master_id: int,
    date_from: date,
    date_to: date,
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    # Смены видят администратор и сам мастер
    role = get_role_name(user, db)
    if role != "admin":
        own = db.query(Master).filter(Master.user_id == user.id).first()
        if role != "master" or own is None or own.id != master_id:
            raise HTTPException(status_code=403, detail="Недостаточно прав")

    return (
        db.query(WorkShift)
        .filter(WorkShift.master_id == master_id)
        .filter(WorkShift.work_date >= date_from, WorkShift.work_date <= date_to)
        .order_by(WorkShift.work_date, WorkShift.start_time)
        .all()
    )


@router.post("/{master_id}/shifts", response_model=ShiftOut, status_code=201)
def create_shift(master_id: int, data: ShiftIn, admin=Depends(require_admin), db: Session = Depends(get_db)):
    master = db.query(Master).filter(Master.id == master_id, Master.is_active == True).first()
    if master is None:
        raise HTTPException(status_code=404, detail="Мастер не найден")
    if data.end_time <= data.start_time:
        raise HTTPException(status_code=422, detail="Конец смены должен быть позже начала")

    branch_id = data.branch_id or master.branch_id
    check_branch(branch_id, db)

    # одна смена мастера на день — так считаются слоты
    exists = db.query(WorkShift).filter(WorkShift.master_id == master_id, WorkShift.work_date == data.work_date).first()
    if exists:
        raise HTTPException(status_code=409, detail="На этот день у мастера уже есть смена")

    shift = WorkShift(
        master_id=master_id,
        branch_id=branch_id,
        work_date=data.work_date,
        start_time=data.start_time,
        end_time=data.end_time,
    )
    db.add(shift)
    db.commit()
    db.refresh(shift)
    return shift
