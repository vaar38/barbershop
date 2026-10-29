from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Appointment, WorkShift
from app.security import require_admin
from app.config import TZ
from datetime import datetime

router = APIRouter(prefix="/api/shifts", tags=["masters"])


@router.delete("/{shift_id}", status_code=204)
def delete_shift(shift_id: int, admin=Depends(require_admin), db: Session = Depends(get_db)):
    shift = db.query(WorkShift).filter(WorkShift.id == shift_id).first()
    if shift is None:
        raise HTTPException(status_code=404, detail="Смена не найдена")

    # Нельзя убрать смену, на которую уже есть активные записи
    start = datetime.combine(shift.work_date, shift.start_time, tzinfo=TZ)
    end = datetime.combine(shift.work_date, shift.end_time, tzinfo=TZ)
    busy = (
        db.query(Appointment)
        .filter(Appointment.master_id == shift.master_id)
        .filter(Appointment.status.in_(["pending", "confirmed"]))
        .filter(Appointment.start_at < end, Appointment.end_at > start)
        .first()
    )
    if busy:
        raise HTTPException(status_code=409, detail="На эту смену уже есть записи — сначала отмените их")

    db.delete(shift)
    db.commit()
