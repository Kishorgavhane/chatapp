from fastapi import WebSocket
from typing import Dict, Set
import json
import logging

logger = logging.getLogger(__name__)

class ConnectionManager:
    def __init__(self):
        # user_id -> set of websockets (multiple tabs)
        self.active: Dict[int, Set[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, user_id: int):
        await websocket.accept()
        if user_id not in self.active:
            self.active[user_id] = set()
        self.active[user_id].add(websocket)
        logger.info(f"User {user_id} connected. Online: {list(self.active.keys())}")

    def disconnect(self, websocket: WebSocket, user_id: int):
        if user_id in self.active:
            self.active[user_id].discard(websocket)
            if not self.active[user_id]:
                del self.active[user_id]
        logger.info(f"User {user_id} disconnected. Online: {list(self.active.keys())}")

    def is_online(self, user_id: int) -> bool:
        return user_id in self.active and len(self.active[user_id]) > 0

    def online_users(self) -> list:
        return list(self.active.keys())

    async def send_to_user(self, user_id: int, data: dict):
        if user_id in self.active:
            dead = set()
            for ws in self.active[user_id]:
                try:
                    await ws.send_json(data)
                except Exception:
                    dead.add(ws)
            for ws in dead:
                self.active[user_id].discard(ws)

    async def broadcast_to_group(self, group_member_ids: list, data: dict, exclude_user: int = None):
        for uid in group_member_ids:
            if uid != exclude_user:
                await self.send_to_user(uid, data)

    async def broadcast_status(self, user_id: int, is_online: bool):
        """Notify all online users about status change"""
        payload = {"type": "status_change", "user_id": user_id, "is_online": is_online}
        for uid in list(self.active.keys()):
            if uid != user_id:
                await self.send_to_user(uid, payload)

manager = ConnectionManager()
