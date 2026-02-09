import json

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query

from backend.app.database import SessionLocal
from backend.app.models.session import Session
from backend.app.models.message import Message
from backend.app.utils.security import decode_access_token

router = APIRouter()


async def send_event(ws: WebSocket, event: str, data: dict) -> None:
    await ws.send_json({"event": event, "data": data})


def save_message(db, session_id: str, role: str, text: str, msg_type: str = "text", plot_data: str | None = None) -> None:
    msg = Message(
        session_id=session_id,
        role=role,
        text=text,
        type=msg_type,
        plot_data=plot_data,
    )
    db.add(msg)
    db.commit()


@router.websocket("/sessions/{session_id}/ws")
async def websocket_chat(
    websocket: WebSocket,
    session_id: str,
    token: str = Query(...),
):
    # Auth: validate JWT from query param
    user_id = decode_access_token(token)
    if not user_id:
        await websocket.close(code=1008, reason="Invalid or expired token")
        return

    # Verify session ownership
    db = SessionLocal()
    try:
        session = db.query(Session).filter(
            Session.id == session_id,
            Session.user_id == user_id,
        ).first()
        if not session:
            await websocket.close(code=1008, reason="Session not found")
            return
    finally:
        db.close()

    await websocket.accept()

    try:
        while True:
            raw = await websocket.receive_text()

            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                await send_event(websocket, "error", {"message": "Invalid JSON"})
                continue

            msg_type = data.get("type")

            if msg_type == "message":
                await handle_message(websocket, session_id, data.get("text", ""))
            elif msg_type == "auto_analyze":
                await handle_auto_analyze(websocket, session_id)
            elif msg_type == "stop":
                await handle_stop(websocket)
            else:
                await send_event(websocket, "error", {"message": f"Unknown message type: {msg_type}"})

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await send_event(websocket, "error", {"message": str(e)})
            await send_event(websocket, "done", {"data_updated": False})
        except Exception:
            pass


async def handle_message(ws: WebSocket, session_id: str, text: str) -> None:
    db = SessionLocal()
    try:
        # Persist user message
        save_message(db, session_id, role="user", text=text)

        # Send status
        await send_event(ws, "status", {"message": "Thinking..."})

        # Stub response: echo user message
        response_text = f"[Stub] You said: {text}\n\nAI agent is not yet connected. This is a placeholder response."

        # Persist assistant message
        save_message(db, session_id, role="assistant", text=response_text)

        # Send response
        await send_event(ws, "text", {"text": response_text})
        await send_event(ws, "done", {"data_updated": False})
    finally:
        db.close()


async def handle_auto_analyze(ws: WebSocket, session_id: str) -> None:
    db = SessionLocal()
    try:
        await send_event(ws, "status", {"message": "Analyzing your data..."})

        response_text = "Auto-analysis will be available soon. You can ask questions about your data in the meantime."

        save_message(db, session_id, role="assistant", text=response_text)

        await send_event(ws, "text", {"text": response_text})
        await send_event(ws, "done", {"data_updated": False})
    finally:
        db.close()


async def handle_stop(ws: WebSocket) -> None:
    # Stub: nothing to cancel yet
    await send_event(ws, "done", {"data_updated": False})
