from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel
from typing import Optional
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.user import User
import httpx, os, logging

router = APIRouter(prefix="/notifications", tags=["notifications"])
logger = logging.getLogger(__name__)

FCM_SERVER_KEY = os.getenv("FCM_SERVER_KEY", "")

class FCMTokenUpdate(BaseModel):
    fcm_token: str

@router.post("/register-token")
def register_token(
    payload: FCMTokenUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    current_user.fcm_token = payload.fcm_token
    db.commit()
    return {"ok": True}

@router.post("/send")
async def send_push(
    target_user_id: int,
    title: str,
    body: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    target = db.query(User).filter(User.id == target_user_id).first()
    if not target or not target.fcm_token:
        return {"ok": False, "reason": "No FCM token"}
    if not FCM_SERVER_KEY:
        return {"ok": False, "reason": "FCM not configured"}

    async with httpx.AsyncClient() as client:
        resp = await client.post(
            "https://fcm.googleapis.com/fcm/send",
            headers={"Authorization": f"key={FCM_SERVER_KEY}", "Content-Type": "application/json"},
            json={"to": target.fcm_token, "notification": {"title": title, "body": body}}
        )
    return {"ok": resp.status_code == 200}
