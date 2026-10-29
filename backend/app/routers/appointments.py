from datetime import datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import TZ
from app.database import get_db
from app.models import Appointment, AppointmentService, Master, MasterService, Service, WorkShift
from app.schemas import AppointmentCreate, AppointmentOut
from app.security import get_current_user

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
