from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.orm import Session, joinedload
from datetime import datetime
from jose import JWTError, jwt
from app.core.config import settings
from app.core.database import SessionLocal
from app.models.user import User
from app.models.message import Message, MessageType, MessageStatus, GroupMember
from app.websocket.manager import manager
import json, logging

router = APIRouter(tags=["websocket"])
logger = logging.getLogger(__name__)

def get_user_from_token(token: str, db: Session):
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return db.query(User).filter(User.id == int(payload.get("sub"))).first()
    except Exception:
        return None

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = Query(...)):
    db = SessionLocal()
    user = get_user_from_token(token, db)
    if not user:
        await websocket.close(code=4001); db.close(); return

    await manager.connect(websocket, user.id)
    user.is_online = True; user.last_seen = datetime.utcnow(); db.commit()
    await manager.broadcast_status(user.id, True)
    await manager.send_to_user(user.id, {"type": "online_list", "users": manager.online_users()})

    try:
        while True:
            data  = json.loads(await websocket.receive_text())
            event = data.get("type")

            if event == "send_message":
                content = data.get("content", "").strip()
                if not content: continue
                receiver_id = data.get("receiver_id")
                group_id    = data.get("group_id")
                msg = Message(content=content, msg_type=MessageType(data.get("msg_type","text")),
                              sender_id=user.id, receiver_id=receiver_id, group_id=group_id, status=MessageStatus.sent)
                db.add(msg); db.commit(); db.refresh(msg)
                msg = db.query(Message).options(joinedload(Message.sender)).filter(Message.id == msg.id).first()
                payload = {"type": "new_message", "message": {
                    "id": msg.id, "content": msg.content, "msg_type": msg.msg_type.value,
                    "status": msg.status.value, "is_deleted": msg.is_deleted, "is_edited": msg.is_edited,
                    "sender_id": msg.sender_id, "receiver_id": msg.receiver_id, "group_id": msg.group_id,
                    "created_at": msg.created_at.isoformat(), "updated_at": msg.updated_at.isoformat(),
                    "sender": {"id": msg.sender.id, "username": msg.sender.username, "avatar_url": msg.sender.avatar_url},
                    "reactions": []}}
                if receiver_id:
                    if manager.is_online(receiver_id):
                        msg.status = MessageStatus.delivered; db.commit(); payload["message"]["status"] = "delivered"
                    await manager.send_to_user(receiver_id, payload)
                    await manager.send_to_user(user.id, payload)
                elif group_id:
                    members = db.query(GroupMember).filter(GroupMember.group_id == group_id).all()
                    await manager.broadcast_to_group([m.user_id for m in members], payload)

            elif event == "typing":
                tid = data.get("receiver_id"); gid = data.get("group_id")
                p = {"type":"typing","user_id":user.id,"username":user.username,"is_typing":data.get("is_typing",True),"receiver_id":tid,"group_id":gid}
                if tid: await manager.send_to_user(tid, p)
                elif gid:
                    members = db.query(GroupMember).filter(GroupMember.group_id == gid).all()
                    await manager.broadcast_to_group([m.user_id for m in members], p, exclude_user=user.id)

            elif event == "mark_seen":
                sid = data.get("sender_id")
                if sid:
                    for m in db.query(Message).filter(Message.sender_id==sid, Message.receiver_id==user.id, Message.status!=MessageStatus.seen).all():
                        m.status = MessageStatus.seen
                    db.commit()
                    await manager.send_to_user(sid, {"type":"seen_update","by_user_id":user.id})

            # ── WebRTC Signaling ──────────────────────────────────────────────
            elif event == "call_offer":
                tid = data.get("target_id")
                await manager.send_to_user(tid, {"type":"call_offer","from_user_id":user.id,
                    "from_username":user.username,"from_avatar":user.avatar_url,
                    "call_type":data.get("call_type","video"),"sdp":data.get("sdp")})

            elif event == "call_answer":
                await manager.send_to_user(data.get("target_id"), {"type":"call_answer","from_user_id":user.id,"sdp":data.get("sdp")})

            elif event == "call_reject":
                await manager.send_to_user(data.get("target_id"), {"type":"call_reject","from_user_id":user.id,"reason":data.get("reason","rejected")})

            elif event == "call_end":
                await manager.send_to_user(data.get("target_id"), {"type":"call_end","from_user_id":user.id})

            elif event == "ice_candidate":
                await manager.send_to_user(data.get("target_id"), {"type":"ice_candidate","from_user_id":user.id,"candidate":data.get("candidate")})

            elif event == "screen_share_start":
                await manager.send_to_user(data.get("target_id"), {"type":"screen_share_start","from_user_id":user.id})

            elif event == "screen_share_stop":
                await manager.send_to_user(data.get("target_id"), {"type":"screen_share_stop","from_user_id":user.id})

            elif event == "ping":
                await manager.send_to_user(user.id, {"type":"pong"})

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error(f"WS error user {user.id}: {e}")
    finally:
        manager.disconnect(websocket, user.id)
        user.is_online = False; user.last_seen = datetime.utcnow(); db.commit(); db.close()
        await manager.broadcast_status(user.id, False)
