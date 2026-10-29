from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import Branch
from app.schemas import BranchIn, BranchOut
from app.security import require_admin

router = APIRouter(prefix="/api/branches", tags=["branches"])


@router.get("", response_model=list[BranchOut])
def list_branches(db: Session = Depends(get_db)):
    return db.query(Branch).filter(Branch.is_active == True).order_by(Branch.name).all()


def save(branch, db):
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Филиал с таким названием уже есть")
    db.refresh(branch)
    return branch


@router.post("", response_model=BranchOut, status_code=201)
def create_branch(data: BranchIn, admin=Depends(require_admin), db: Session = Depends(get_db)):
    branch = Branch(name=data.name, address=data.address, phone=data.phone)
    db.add(branch)
    return save(branch, db)


@router.put("/{branch_id}", response_model=BranchOut)
def update_branch(branch_id: int, data: BranchIn, admin=Depends(require_admin), db: Session = Depends(get_db)):
    branch = db.query(Branch).filter(Branch.id == branch_id).first()
    if branch is None:
        raise HTTPException(status_code=404, detail="Филиал не найден")
    branch.name = data.name
    branch.address = data.address
    branch.phone = data.phone
    return save(branch, db)


@router.delete("/{branch_id}", status_code=204)
def delete_branch(branch_id: int, admin=Depends(require_admin), db: Session = Depends(get_db)):
    # Закрытый филиал не удаляем — на него ссылаются старые записи, просто выключаем
    branch = db.query(Branch).filter(Branch.id == branch_id).first()
    if branch is None:
        raise HTTPException(status_code=404, detail="Филиал не найден")
    branch.is_active = False
    db.commit()
