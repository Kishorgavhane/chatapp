from pydantic import BaseModel, EmailStr, field_validator
from typing import Optional, List
from datetime import datetime
from app.models.message import MessageType, MessageStatus

# ── Auth ──────────────────────────────────────────────────────────────────────
class UserRegister(BaseModel):
    email: EmailStr
    username: str
    password: str

    @field_validator('username')
    @classmethod
    def username_valid(cls, v):
        v = v.strip()
        if len(v) < 3:
            raise ValueError('Username must be at least 3 characters')
        if len(v) > 30:
            raise ValueError('Username too long')
        return v

    @field_validator('password')
    @classmethod
    def password_valid(cls, v):
        if len(v) < 6:
            raise ValueError('Password must be at least 6 characters')
        return v

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user_id: int
    username: str
    email: str

# ── User ──────────────────────────────────────────────────────────────────────
class UserOut(BaseModel):
    id: int
    email: str
    username: str
    avatar_url: str
    bio: str
    is_online: bool
    last_seen: datetime
    created_at: datetime

    class Config:
        from_attributes = True

class UserUpdate(BaseModel):
    username: Optional[str] = None
    bio: Optional[str] = None

# ── Message ───────────────────────────────────────────────────────────────────
class MessageOut(BaseModel):
    id: int
    content: str
    msg_type: MessageType
    status: MessageStatus
    is_deleted: bool
    is_edited: bool
    sender_id: int
    receiver_id: Optional[int] = None
    group_id: Optional[int] = None
    created_at: datetime
    updated_at: datetime
    sender: Optional[UserOut] = None
    reactions: List[dict] = []

    class Config:
        from_attributes = True

class MessageCreate(BaseModel):
    content: str
    msg_type: MessageType = MessageType.text
    receiver_id: Optional[int] = None
    group_id: Optional[int] = None

class MessageEdit(BaseModel):
    content: str

# ── Group ─────────────────────────────────────────────────────────────────────
class GroupCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    member_ids: List[int] = []

class GroupOut(BaseModel):
    id: int
    name: str
    description: str
    avatar_url: str
    created_by: int
    created_at: datetime

    class Config:
        from_attributes = True
