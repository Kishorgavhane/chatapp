from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
import os
from app.core.database import Base, engine
from app.routers import auth, users, messages, groups, notifications
from app.websocket.ws_router import router as ws_router

Base.metadata.create_all(bind=engine)
os.makedirs("/app/media", exist_ok=True)

app = FastAPI(title="ChatApp API", version="4.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])
app.mount("/media", StaticFiles(directory="/app/media"), name="media")

app.include_router(auth.router,          prefix="/api")
app.include_router(users.router,         prefix="/api")
app.include_router(messages.router,      prefix="/api")
app.include_router(groups.router,        prefix="/api")
app.include_router(notifications.router, prefix="/api")
app.include_router(ws_router)

@app.get("/health")
def health():
    return {"status": "ok", "service": "chatapp-api", "version": "4.0.0"}
