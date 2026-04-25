"""
Ollama AI Chat Router
Streams responses from local Ollama instance.
Models: llama3, mistral, gemma, phi3, etc.
"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import List, Optional
from app.core.security import get_current_user
from app.models.user import User
import httpx, json, os, logging

router = APIRouter(prefix="/ai", tags=["ai"])
logger = logging.getLogger(__name__)

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://ollama:11434")
DEFAULT_MODEL = os.getenv("OLLAMA_MODEL", "llama3.2")

class ChatMessage(BaseModel):
    role: str      # user | assistant | system
    content: str

class AIRequest(BaseModel):
    message: str
    model: Optional[str] = None
    history: Optional[List[ChatMessage]] = []
    system_prompt: Optional[str] = "You are a helpful AI assistant inside a chat application called ChatApp. Be concise, friendly, and helpful."

class AIModelsResponse(BaseModel):
    models: List[str]

# ── List available Ollama models ──────────────────────────────────────────────
@router.get("/models")
async def list_models(current_user: User = Depends(get_current_user)):
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{OLLAMA_URL}/api/tags")
            data = resp.json()
            models = [m["name"] for m in data.get("models", [])]
            return {"models": models, "default": DEFAULT_MODEL}
    except Exception as e:
        logger.warning(f"Ollama not reachable: {e}")
        return {"models": [], "default": DEFAULT_MODEL, "error": "Ollama not running"}

# ── Health check for Ollama ───────────────────────────────────────────────────
@router.get("/health")
async def ai_health():
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            resp = await client.get(f"{OLLAMA_URL}/api/tags")
            return {"status": "ok", "ollama": OLLAMA_URL, "reachable": resp.status_code == 200}
    except:
        return {"status": "error", "ollama": OLLAMA_URL, "reachable": False}

# ── Streaming AI chat ─────────────────────────────────────────────────────────
@router.post("/chat/stream")
async def chat_stream(
    req: AIRequest,
    current_user: User = Depends(get_current_user)
):
    model = req.model or DEFAULT_MODEL

    # Build messages array for Ollama
    messages = []
    if req.system_prompt:
        messages.append({"role": "system", "content": req.system_prompt})
    for msg in (req.history or []):
        messages.append({"role": msg.role, "content": msg.content})
    messages.append({"role": "user", "content": req.message})

    async def generate():
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                async with client.stream(
                    "POST",
                    f"{OLLAMA_URL}/api/chat",
                    json={"model": model, "messages": messages, "stream": True},
                ) as resp:
                    if resp.status_code != 200:
                        yield f"data: {json.dumps({'error': 'Ollama error', 'status': resp.status_code})}\n\n"
                        return
                    async for line in resp.aiter_lines():
                        if line.strip():
                            try:
                                chunk = json.loads(line)
                                content = chunk.get("message", {}).get("content", "")
                                done    = chunk.get("done", False)
                                if content:
                                    yield f"data: {json.dumps({'content': content, 'done': done})}\n\n"
                                if done:
                                    yield f"data: {json.dumps({'content': '', 'done': True})}\n\n"
                                    break
                            except json.JSONDecodeError:
                                continue
        except httpx.ConnectError:
            yield f"data: {json.dumps({'error': 'Cannot connect to Ollama. Make sure it is running.'})}\n\n"
        except Exception as e:
            logger.error(f"AI stream error: {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream",
                             headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})

# ── Non-streaming (simple) ────────────────────────────────────────────────────
@router.post("/chat")
async def chat(
    req: AIRequest,
    current_user: User = Depends(get_current_user)
):
    model = req.model or DEFAULT_MODEL
    messages = []
    if req.system_prompt:
        messages.append({"role": "system", "content": req.system_prompt})
    for msg in (req.history or []):
        messages.append({"role": msg.role, "content": msg.content})
    messages.append({"role": "user", "content": req.message})

    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{OLLAMA_URL}/api/chat",
                json={"model": model, "messages": messages, "stream": False}
            )
            data = resp.json()
            return {
                "response": data.get("message", {}).get("content", ""),
                "model": model,
                "done": True
            }
    except httpx.ConnectError:
        raise HTTPException(503, "Ollama is not running. Start it with: ollama serve")
    except Exception as e:
        raise HTTPException(500, str(e))
