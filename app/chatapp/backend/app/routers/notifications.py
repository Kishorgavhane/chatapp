from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
import httpx, os, logging

router = APIRouter(prefix="/notifications", tags=["notifications"])
logger = logging.getLogger(__name__)

FCM_SERVER_KEY = os.getenv("FCM_SERVER_KEY", "")
FCM_URL = "https://fcm.googleapis.com/fcm/send"

class FCMTokenUpdate(BaseModel):
    fcm_token: str

class PushPayload(BaseModel):
    target_user_id: int
    title: str
    body: str
    data: dict = {}

@router.post("/register-token")
def register_token(
    payload: FCMTokenUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Save FCM token for this user device."""
    current_user.fcm_token = payload.fcm_token
    db.commit()
    return {"ok": True}

@router.post("/send")
async def send_push(
    payload: PushPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Send push notification to a user (called server-side)."""
    target = db.query(User).filter(User.id == payload.target_user_id).first()
    if not target or not getattr(target, "fcm_token", None):
        return {"ok": False, "reason": "No FCM token"}

    if not FCM_SERVER_KEY:
        logger.warning("FCM_SERVER_KEY not set – notification skipped")
        return {"ok": False, "reason": "FCM not configured"}

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            FCM_URL,
            headers={"Authorization": f"key={FCM_SERVER_KEY}", "Content-Type": "application/json"},
            json={
                "to": target.fcm_token,
                "notification": {"title": payload.title, "body": payload.body, "sound": "default"},
                "data": payload.data,
                "priority": "high",
            }
        )
    return {"ok": resp.status_code == 200, "fcm_response": resp.json()}
