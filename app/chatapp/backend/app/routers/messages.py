from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from sqlalchemy.orm import Session, joinedload
from typing import List, Optional
import os, shutil, uuid
from app.core.database import get_db
from app.core.security import get_current_user
from app.core.config import settings
from app.models.message import Message, MessageStatus, MessageType, Reaction, GroupMember
from app.models.user import User
from app.schemas.schemas import MessageOut, MessageEdit
from app.websocket.manager import manager

router = APIRouter(prefix="/messages", tags=["messages"])

def _msg_query(db):
    return db.query(Message).options(joinedload(Message.sender), joinedload(Message.reactions))

@router.get("/search", response_model=List[MessageOut])
def search_messages(
    q: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    msgs = _msg_query(db).filter(
        Message.content.ilike(f"%{q}%"),
        Message.is_deleted == False,
        Message.msg_type == MessageType.text,
        ((Message.sender_id == current_user.id) | (Message.receiver_id == current_user.id))
    ).order_by(Message.created_at.desc()).limit(40).all()
    return msgs

@router.get("/conversation/{other_user_id}", response_model=List[MessageOut])
def get_conversation(
    other_user_id: int, skip: int = 0, limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    msgs = _msg_query(db).filter(
        Message.group_id == None,
        ((Message.sender_id == current_user.id) & (Message.receiver_id == other_user_id)) |
        ((Message.sender_id == other_user_id)   & (Message.receiver_id == current_user.id))
    ).order_by(Message.created_at.desc()).offset(skip).limit(limit).all()
    for m in msgs:
        if m.receiver_id == current_user.id and m.status != MessageStatus.seen:
            m.status = MessageStatus.seen
    db.commit()
    return list(reversed(msgs))

@router.get("/group/{group_id}", response_model=List[MessageOut])
def get_group_messages(
    group_id: int, skip: int = 0, limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    msgs = _msg_query(db).filter(Message.group_id == group_id
    ).order_by(Message.created_at.desc()).offset(skip).limit(limit).all()
    return list(reversed(msgs))

@router.patch("/{msg_id}", response_model=MessageOut)
def edit_message(msg_id: int, data: MessageEdit, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    msg = db.query(Message).filter(Message.id == msg_id, Message.sender_id == current_user.id).first()
    if not msg: raise HTTPException(404, "Message not found")
    msg.content = data.content
    msg.is_edited = True
    db.commit(); db.refresh(msg)
    return msg

@router.delete("/{msg_id}")
def delete_message(msg_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    msg = db.query(Message).filter(Message.id == msg_id, Message.sender_id == current_user.id).first()
    if not msg: raise HTTPException(404, "Message not found")
    msg.is_deleted = True
    msg.content = "This message was deleted"
    db.commit()
    return {"deleted": msg_id}

@router.post("/{msg_id}/react")
async def react_to_message(msg_id: int, emoji: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    msg = db.query(Message).filter(Message.id == msg_id).first()
    if not msg: raise HTTPException(404, "Message not found")
    existing = db.query(Reaction).filter(Reaction.message_id == msg_id, Reaction.user_id == current_user.id).first()
    if existing: existing.emoji = emoji
    else: db.add(Reaction(emoji=emoji, user_id=current_user.id, message_id=msg_id))
    db.commit()
    payload = {"type": "reaction", "message_id": msg_id, "user_id": current_user.id, "emoji": emoji}
    if msg.receiver_id: await manager.send_to_user(msg.receiver_id, payload)
    await manager.send_to_user(msg.sender_id, payload)
    return {"ok": True}

@router.post("/upload-media")
async def upload_media(file: UploadFile = File(...), current_user: User = Depends(get_current_user)):
    os.makedirs(settings.MEDIA_DIR, exist_ok=True)
    ext = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else "bin"
    filename = f"media_{uuid.uuid4().hex}.{ext}"
    path = os.path.join(settings.MEDIA_DIR, filename)
    with open(path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    return {"url": f"/media/{filename}", "filename": file.filename}
