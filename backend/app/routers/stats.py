from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import TZ
from app.database import get_db
from app.models import Appointment, Master, User
from app.security import require_admin

router = APIRouter(prefix="/api/stats", tags=["stats"])


@router.get("")
def get_stats(date_from: date, date_to: date, admin=Depends(require_admin), db: Session = Depends(get_db)):
    start = datetime.combine(date_from, time.min, tzinfo=TZ)
    end = datetime.combine(date_to + timedelta(days=1), time.min, tzinfo=TZ)
    period = (Appointment.start_at >= start, Appointment.start_at < end)

    # число записей по статусам
    by_status = dict(
        db.query(Appointment.status, func.count(Appointment.id)).filter(*period).group_by(Appointment.status).all()
    )

    # выручка — только по состоявшимся визитам
    revenue = (
        db.query(func.coalesce(func.sum(Appointment.total_price), 0))
        .filter(*period, Appointment.status == "completed")
        .scalar()
    )

    # сколько записей у каждого мастера (без отменённых)
    per_master = (
        db.query(Master.id, User.full_name, func.count(Appointment.id))
        .join(User, User.id == Master.user_id)
        .join(Appointment, Appointment.master_id == Master.id)
        .filter(*period, Appointment.status != "cancelled")
        .group_by(Master.id, User.full_name)
        .order_by(func.count(Appointment.id).desc())
        .all()
    )

    return {
        "date_from": date_from,
        "date_to": date_to,
        "by_status": by_status,
        "total": sum(by_status.values()),
        "revenue": revenue,
        "per_master": [{"master_id": mid, "full_name": name, "appointments": n} for mid, name, n in per_master],
    }
