from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text
from sqlalchemy.orm import relationship
from datetime import datetime
from app.core.database import Base

class User(Base):
    __tablename__ = "users"

    id         = Column(Integer, primary_key=True, index=True)
    email      = Column(String(255), unique=True, index=True, nullable=False)
    username   = Column(String(80), unique=True, index=True, nullable=False)
    hashed_pw  = Column(String(255), nullable=False)
    avatar_url = Column(String(500), default="")
    bio        = Column(Text, default="")
    is_online  = Column(Boolean, default=False)
    last_seen  = Column(DateTime, default=datetime.utcnow)
    created_at = Column(DateTime, default=datetime.utcnow)

    sent_messages     = relationship("Message", foreign_keys="Message.sender_id", back_populates="sender")
    group_memberships = relationship("GroupMember", back_populates="user")

# Phase 4: FCM push notification token
User.fcm_token = None  # Added via Alembic migration in prod; patched here for SQLite/dev auto-create
