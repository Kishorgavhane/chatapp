from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from typing import List
import os, shutil, uuid
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.config import settings
from app.models.user import User
from app.schemas.schemas import UserOut, UserUpdate
from app.websocket.manager import manager

router = APIRouter(prefix="/users", tags=["users"])

@router.get("/me", response_model=UserOut)
def get_me(current_user: User = Depends(get_current_user)):
    return current_user

@router.patch("/me", response_model=UserOut)
def update_profile(data: UserUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    if data.username:
        existing = db.query(User).filter(User.username == data.username, User.id != current_user.id).first()
        if existing:
            raise HTTPException(400, "Username taken")
        current_user.username = data.username
    if data.bio is not None:
        current_user.bio = data.bio
    db.commit()
    db.refresh(current_user)
    return current_user

@router.post("/me/avatar", response_model=UserOut)
async def upload_avatar(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    ext = file.filename.split(".")[-1].lower()
    if ext not in ("jpg", "jpeg", "png", "webp"):
        raise HTTPException(400, "Only jpg/png/webp allowed")
    os.makedirs(settings.MEDIA_DIR, exist_ok=True)
    filename = f"avatar_{current_user.id}_{uuid.uuid4().hex}.{ext}"
    path = os.path.join(settings.MEDIA_DIR, filename)
    with open(path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    current_user.avatar_url = f"/media/{filename}"
    db.commit()
    db.refresh(current_user)
    return current_user

@router.get("/search", response_model=List[UserOut])
def search_users(q: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    users = db.query(User).filter(
        (User.username.ilike(f"%{q}%") | User.email.ilike(f"%{q}%")),
        User.id != current_user.id
    ).limit(20).all()
    # Inject real-time online status
    for u in users:
        u.is_online = manager.is_online(u.id)
    return users

@router.get("/online", response_model=List[int])
def online_users(current_user: User = Depends(get_current_user)):
    return manager.online_users()

@router.get("/{user_id}", response_model=UserOut)
def get_user(user_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    user.is_online = manager.is_online(user.id)
    return user
