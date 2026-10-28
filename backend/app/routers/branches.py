from fastapi import APIRouter, Depends, HTTPException
from app.schemas import BranchOut
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import Branch

router = APIRouter(prefix="/api/branches", tags=["branches"])

@router.get("", response_model = list[BranchOut])
def list_branches(db: Session = Depends(get_db)):
    return db.query(Branch).filter(Branch.is_active == True).order_by(Branch.name).all()
