from fastapi import APIRouter, Depends, HTTPException
from app.schemas import ServiceOut
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Master, MasterService, Service

router = APIRouter(prefix="/api/services", tags=["services"])

@router.get("", response_model=list[ServiceOut])
def list_services(category_id: int | None = None, branch_id: int | None = None, db: Session = Depends(get_db)):
    query = db.query(Service).filter(Service.is_active == True)
    if category_id:
        query = query.filter(Service.category_id == category_id)
    if branch_id:
        query = (
            query.join(MasterService, MasterService.service_id == Service.id)
            .join(Master, Master.id == MasterService.master_id)
            .filter(Master.branch_id == branch_id, Master.is_active == True)
            .distinct()
        )
    return query.order_by(Service.name).all()
