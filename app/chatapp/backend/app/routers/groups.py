from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.message import Group, GroupMember
from app.models.user import User
from app.schemas.schemas import GroupCreate, GroupOut

router = APIRouter(prefix="/groups", tags=["groups"])

@router.post("/", response_model=GroupOut)
def create_group(data: GroupCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    group = Group(name=data.name, description=data.description or "", created_by=current_user.id)
    db.add(group)
    db.flush()

    # Add creator as admin
    member_ids = list(set(data.member_ids + [current_user.id]))
    for uid in member_ids:
        db.add(GroupMember(
            group_id=group.id,
            user_id=uid,
            is_admin=(uid == current_user.id)
        ))
    db.commit()
    db.refresh(group)
    return group

@router.get("/", response_model=List[GroupOut])
def my_groups(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    memberships = db.query(GroupMember).filter(GroupMember.user_id == current_user.id).all()
    group_ids = [m.group_id for m in memberships]
    return db.query(Group).filter(Group.id.in_(group_ids)).all()

@router.get("/{group_id}", response_model=GroupOut)
def get_group(group_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(404, "Group not found")
    return group

@router.post("/{group_id}/members/{user_id}")
def add_member(group_id: int, user_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    admin = db.query(GroupMember).filter(
        GroupMember.group_id == group_id,
        GroupMember.user_id == current_user.id,
        GroupMember.is_admin == True
    ).first()
    if not admin:
        raise HTTPException(403, "Only admins can add members")
    existing = db.query(GroupMember).filter(GroupMember.group_id == group_id, GroupMember.user_id == user_id).first()
    if existing:
        raise HTTPException(400, "Already a member")
    db.add(GroupMember(group_id=group_id, user_id=user_id))
    db.commit()
    return {"ok": True}

@router.delete("/{group_id}/members/{user_id}")
def remove_member(group_id: int, user_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if user_id != current_user.id:
        admin = db.query(GroupMember).filter(
            GroupMember.group_id == group_id,
            GroupMember.user_id == current_user.id,
            GroupMember.is_admin == True
        ).first()
        if not admin:
            raise HTTPException(403, "Only admins can remove members")
    member = db.query(GroupMember).filter(GroupMember.group_id == group_id, GroupMember.user_id == user_id).first()
    if member:
        db.delete(member)
        db.commit()
    return {"ok": True}
