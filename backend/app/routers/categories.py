from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Service, ServiceCategory
from app.schemas import CategoryIn, CategoryOut
from app.security import require_admin

router = APIRouter(prefix="/api/categories", tags=["categories"])


@router.get("", response_model=list[CategoryOut])
def list_categories(db: Session = Depends(get_db)):
    return db.query(ServiceCategory).order_by(ServiceCategory.name).all()


def save(category, db):
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Категория с таким названием уже есть")
    db.refresh(category)
    return category


@router.post("", response_model=CategoryOut, status_code=201)
def create_category(data: CategoryIn, admin=Depends(require_admin), db: Session = Depends(get_db)):
    category = ServiceCategory(name=data.name)
    db.add(category)
    return save(category, db)


@router.put("/{category_id}", response_model=CategoryOut)
def update_category(category_id: int, data: CategoryIn, admin=Depends(require_admin), db: Session = Depends(get_db)):
    category = db.query(ServiceCategory).filter(ServiceCategory.id == category_id).first()
    if category is None:
        raise HTTPException(status_code=404, detail="Категория не найдена")
    category.name = data.name
    return save(category, db)


@router.delete("/{category_id}", status_code=204)
def delete_category(category_id: int, admin=Depends(require_admin), db: Session = Depends(get_db)):
    category = db.query(ServiceCategory).filter(ServiceCategory.id == category_id).first()
    if category is None:
        raise HTTPException(status_code=404, detail="Категория не найдена")
    # Категорию с услугами удалить нельзя — сначала перенесите или удалите услуги
    if db.query(Service).filter(Service.category_id == category_id).first():
        raise HTTPException(status_code=409, detail="В категории есть услуги")
    db.delete(category)
    db.commit()
