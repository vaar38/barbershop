from datetime import datetime, timedelta, date, time
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import TZ
from app.database import get_db
from app.models import Appointment, AppointmentService, Master, MasterService, Review, Service, WorkShift
from app.schemas import AppointmentCreate, AppointmentOut, ReviewCreate, ReviewOut, StatusUpdate
from app.security import get_current_user, get_role_name


router = APIRouter(prefix="/api/appointments", tags=["appointments"])

# Коэффициент цены по уровню мастера
LEVEL_FACTOR = {"junior": Decimal("1.0"), "middle": Decimal("1.2"), "top": Decimal("1.5")}
SLOT_STEP = timedelta(minutes=15)


@router.post("", response_model=AppointmentOut, status_code=201)
def create_appointment(data: AppointmentCreate, user=Depends(get_current_user), db: Session = Depends(get_db)):
    # 1. Мастер существует и работает
    master = db.query(Master).filter(Master.id == data.master_id).first()
    if master is None or not master.is_active:
        raise HTTPException(status_code=404, detail="Мастер не найден")

    # 2. Все выбранные услуги активны и их делает этот мастер
    services = (
        db.query(Service)
        .join(MasterService, MasterService.service_id == Service.id)
        .filter(MasterService.master_id == data.master_id)
        .filter(Service.id.in_(data.service_ids))
        .filter(Service.is_active == True)
        .all()
    )
    if len(services) != len(set(data.service_ids)):
        raise HTTPException(status_code=422, detail="Мастер не оказывает выбранные услуги")

    # 3. Начало и конец записи. Если клиент прислал время без пояса — считаем его местным
    start_at = data.start_at
    if start_at.tzinfo is None:
        start_at = start_at.replace(tzinfo=TZ)
    duration = timedelta(minutes=sum(s.duration_min for s in services))
    end_at = start_at + duration

    if start_at <= datetime.now(TZ):
        raise HTTPException(status_code=422, detail="Нельзя записаться на прошедшее время")

    # 4. Запись целиком внутри смены мастера и попадает в сетку 15 минут
    day = start_at.astimezone(TZ).date()
    shift = db.query(WorkShift).filter(WorkShift.master_id == master.id, WorkShift.work_date == day).first()
    if shift is None:
        raise HTTPException(status_code=422, detail="Нельзя записаться на это время")

    shift_start = datetime.combine(day, shift.start_time, tzinfo=TZ)
    shift_end = datetime.combine(day, shift.end_time, tzinfo=TZ)
    if start_at < shift_start or end_at > shift_end or (start_at - shift_start) % SLOT_STEP:
        raise HTTPException(status_code=422, detail="Нельзя записаться на это время")

    # 5. Время не пересекается с активной записью этого мастера
    overlap = (
        db.query(Appointment)
        .filter(Appointment.master_id == master.id)
        .filter(Appointment.status.in_(["pending", "confirmed"]))
        .filter(Appointment.start_at < end_at, Appointment.end_at > start_at)
        .first()
    )
    if overlap is not None:
        raise HTTPException(status_code=409, detail="Время уже занято")

    # 6. Цена каждой услуги с учётом уровня мастера и итог
    factor = LEVEL_FACTOR[master.level]
    prices = {s.id: (s.base_price * factor).quantize(Decimal("0.01")) for s in services}

    # 7. Сохраняем запись и её состав одной транзакцией
    appointment = Appointment(
        client_id=user.id,
        master_id=master.id,
        branch_id=shift.branch_id,
        start_at=start_at,
        end_at=end_at,
        status="pending",
        total_price=sum(prices.values()),
        comment=data.comment,
    )
    # Если запись на это же время успели создать параллельно, база отклонит её
    # ограничением ex_appointments_no_overlap — отвечаем так же, как при пересечении
    try:
        db.add(appointment)
        db.flush()  # INSERT в базу: запись получает id, но транзакция ещё не закрыта

        for s in services:
            db.add(AppointmentService(
                appointment_id=appointment.id,
                service_id=s.id,
                price=prices[s.id],
                duration_min=s.duration_min,
            ))
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Время уже занято")

    db.refresh(appointment)
    return appointment


@router.get("", response_model=list[AppointmentOut])
def list_appointments(
    status: str | None = None,
    date_from: date | None = None,
    date_to: date | None = None,
    master_id: int | None = None,
    branch_id: int | None = None,
    user=Depends(get_current_user),
    db: Session = Depends(get_db),
):
    role = get_role_name(user, db)
    query = db.query(Appointment)

    if role == "client":
        query = query.filter(Appointment.client_id == user.id)
    elif role == "master":
        master = db.query(Master).filter(Master.user_id == user.id).first()
        if master is None:
            return []
        query = query.filter(Appointment.master_id == master.id)
    else:
        # фильтры по мастеру и филиалу — только у администратора
        if master_id:
            query = query.filter(Appointment.master_id == master_id)
        if branch_id:
            query = query.filter(Appointment.branch_id == branch_id)

    if status:
        query = query.filter(Appointment.status == status)
    if date_from:
        query = query.filter(Appointment.start_at >= datetime.combine(date_from, time.min, tzinfo=TZ))
    if date_to:
        next_day = date_to + timedelta(days=1)
        query = query.filter(Appointment.start_at < datetime.combine(next_day, time.min, tzinfo=TZ))

    return query.order_by(Appointment.start_at).all()


CANCEL_DEADLINE = timedelta(hours=2)


# Найти запись, которую этот пользователь имеет право видеть.
# Чужая запись и несуществующая выглядят одинаково — 404, чтобы не раскрывать её существование
def find_visible(appointment_id, user, role, db):
    appointment = db.query(Appointment).filter(Appointment.id == appointment_id).first()
    if appointment is None:
        raise HTTPException(status_code=404, detail="Запись не найдена")

    if role == "client" and appointment.client_id != user.id:
        raise HTTPException(status_code=404, detail="Запись не найдена")
    if role == "master":
        master = db.query(Master).filter(Master.user_id == user.id).first()
        if master is None or appointment.master_id != master.id:
            raise HTTPException(status_code=404, detail="Запись не найдена")
    return appointment


@router.get("/{appointment_id}", response_model=AppointmentOut)
def get_appointment(appointment_id: int, user=Depends(get_current_user), db: Session = Depends(get_db)):
    return find_visible(appointment_id, user, get_role_name(user, db), db)


@router.post("/{appointment_id}/cancel", response_model=AppointmentOut)
def cancel_appointment(appointment_id: int, user=Depends(get_current_user), db: Session = Depends(get_db)):
    # Отменяет клиент (свою, не позже чем за 2 часа) или администратор (любую и в любое время)
    role = get_role_name(user, db)
    if role == "master":
        raise HTTPException(status_code=403, detail="Мастер не может отменять записи")

    appointment = find_visible(appointment_id, user, role, db)
    if appointment.status not in ("pending", "confirmed"):
        raise HTTPException(status_code=409, detail="Эту запись уже нельзя отменить")

    now = datetime.now(TZ)
    if role == "client" and appointment.start_at - now < CANCEL_DEADLINE:
        raise HTTPException(status_code=422, detail="Отменить можно не позже чем за 2 часа до начала")

    appointment.status = "cancelled"
    appointment.cancelled_at = now
    db.commit()
    db.refresh(appointment)
    return appointment


# Разрешённые переходы статуса (см. диаграмму состояний в readme)
NEXT_STATUS = {
    "pending": {"confirmed"},
    "confirmed": {"completed", "no_show"},
}


@router.patch("/{appointment_id}/status", response_model=AppointmentOut)
def change_status(appointment_id: int, data: StatusUpdate, user=Depends(get_current_user), db: Session = Depends(get_db)):
    role = get_role_name(user, db)
    if role == "client":
        raise HTTPException(status_code=403, detail="Статус меняет мастер или администратор")

    appointment = find_visible(appointment_id, user, role, db)
    if data.status not in NEXT_STATUS.get(appointment.status, set()):
        raise HTTPException(status_code=422, detail=f"Нельзя перевести запись из {appointment.status} в {data.status}")

    # Итог визита ставится, только когда время записи уже началось
    if data.status in ("completed", "no_show") and appointment.start_at > datetime.now(TZ):
        raise HTTPException(status_code=422, detail="Итог визита можно отметить только после начала записи")

    appointment.status = data.status
    db.commit()
    db.refresh(appointment)
    return appointment


@router.post("/{appointment_id}/review", response_model=ReviewOut, status_code=201)
def create_review(appointment_id: int, data: ReviewCreate, user=Depends(get_current_user), db: Session = Depends(get_db)):
    # Отзыв оставляет только клиент записи и только после состоявшегося визита
    appointment = db.query(Appointment).filter(Appointment.id == appointment_id).first()
    if appointment is None or appointment.client_id != user.id:
        raise HTTPException(status_code=404, detail="Запись не найдена")
    if appointment.status != "completed":
        raise HTTPException(status_code=422, detail="Отзыв можно оставить только после визита")

    review = Review(appointment_id=appointment.id, rating=data.rating, text=data.text)
    db.add(review)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Отзыв на эту запись уже есть")
    db.refresh(review)
    return review
