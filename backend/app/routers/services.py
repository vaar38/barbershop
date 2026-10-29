from fastapi import APIRouter, Depends, HTTPException
from app.schemas import ServiceIn, ServiceOut
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Master, MasterService, Service, ServiceCategory
from app.security import require_admin

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


def check_category(category_id, db):
    if db.query(ServiceCategory).filter(ServiceCategory.id == category_id).first() is None:
        raise HTTPException(status_code=422, detail="Категория не найдена")


@router.post("", response_model=ServiceOut, status_code=201)
def create_service(data: ServiceIn, admin=Depends(require_admin), db: Session = Depends(get_db)):
    check_category(data.category_id, db)
    service = Service(**data.model_dump())
    db.add(service)
    db.commit()
    db.refresh(service)
    return service


@router.put("/{service_id}", response_model=ServiceOut)
def update_service(service_id: int, data: ServiceIn, admin=Depends(require_admin), db: Session = Depends(get_db)):
    service = db.query(Service).filter(Service.id == service_id).first()
    if service is None:
        raise HTTPException(status_code=404, detail="Услуга не найдена")
    check_category(data.category_id, db)
    # старые записи не изменятся: цена и длительность в них сохранены снимком
    for field, value in data.model_dump().items():
        setattr(service, field, value)
    db.commit()
    db.refresh(service)
    return service


@router.delete("/{service_id}", status_code=204)
def delete_service(service_id: int, admin=Depends(require_admin), db: Session = Depends(get_db)):
    # Услугу не удаляем — она есть в старых записях. Снимаем с продажи
    service = db.query(Service).filter(Service.id == service_id).first()
    if service is None:
        raise HTTPException(status_code=404, detail="Услуга не найдена")
    service.is_active = False
    db.commit()
