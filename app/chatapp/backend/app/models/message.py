from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey, Enum
from sqlalchemy.orm import relationship
from datetime import datetime
import enum
from app.core.database import Base

class MessageType(str, enum.Enum):
    text  = "text"
    image = "image"
    file  = "file"
    audio = "audio"

class MessageStatus(str, enum.Enum):
    sent      = "sent"
    delivered = "delivered"
    seen      = "seen"

class Message(Base):
    __tablename__ = "messages"

    id          = Column(Integer, primary_key=True, index=True)
    content     = Column(Text, nullable=False)
    msg_type    = Column(Enum(MessageType), default=MessageType.text)
    status      = Column(Enum(MessageStatus), default=MessageStatus.sent)
    is_deleted  = Column(Boolean, default=False)
    is_edited   = Column(Boolean, default=False)

    sender_id   = Column(Integer, ForeignKey("users.id"), nullable=False)
    receiver_id = Column(Integer, ForeignKey("users.id"), nullable=True)   # null for group
    group_id    = Column(Integer, ForeignKey("groups.id"), nullable=True)  # null for 1-to-1

    created_at  = Column(DateTime, default=datetime.utcnow)
    updated_at  = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    sender   = relationship("User", foreign_keys=[sender_id], back_populates="sent_messages")
    receiver = relationship("User", foreign_keys=[receiver_id])
    group    = relationship("Group", back_populates="messages")

    reactions = relationship("Reaction", back_populates="message", cascade="all, delete-orphan")


class Reaction(Base):
    __tablename__ = "reactions"

    id         = Column(Integer, primary_key=True)
    emoji      = Column(String(10), nullable=False)
    user_id    = Column(Integer, ForeignKey("users.id"))
    message_id = Column(Integer, ForeignKey("messages.id"))
    created_at = Column(DateTime, default=datetime.utcnow)

    message = relationship("Message", back_populates="reactions")


class Group(Base):
    __tablename__ = "groups"

    id          = Column(Integer, primary_key=True, index=True)
    name        = Column(String(120), nullable=False)
    description = Column(Text, default="")
    avatar_url  = Column(String(500), default="")
    created_by  = Column(Integer, ForeignKey("users.id"))
    created_at  = Column(DateTime, default=datetime.utcnow)

    members  = relationship("GroupMember", back_populates="group", cascade="all, delete-orphan")
    messages = relationship("Message", back_populates="group")


class GroupMember(Base):
    __tablename__ = "group_members"

    id        = Column(Integer, primary_key=True)
    group_id  = Column(Integer, ForeignKey("groups.id"))
    user_id   = Column(Integer, ForeignKey("users.id"))
    is_admin  = Column(Boolean, default=False)
    joined_at = Column(DateTime, default=datetime.utcnow)

    group = relationship("Group", back_populates="members")
    user  = relationship("User", back_populates="group_memberships")
