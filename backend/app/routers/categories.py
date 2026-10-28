from fastapi import APIRouter, Depends, HTTPException
from app.schemas import CategoryOut
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import ServiceCategory

router = APIRouter(prefix="/api/categories", tags=["categories"])


@router.get("", response_model=list[CategoryOut])
def list_categories(db: Session = Depends(get_db)):
    return db.query(ServiceCategory).order_by(ServiceCategory.name).all()

