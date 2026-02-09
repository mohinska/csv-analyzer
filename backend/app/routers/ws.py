import json
import asyncio
from functools import partial

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query

from backend.app.database import SessionLocal
from backend.app.models.session import Session
from backend.app.models.file import File
from backend.app.models.message import Message
from backend.app.utils.security import decode_access_token
from backend.app.agent.graph import run_agent
from backend.app.agent.persistence import save_user_message

router = APIRouter()

# Track running agent tasks so we can cancel on "stop"
_active_tasks: dict[str, asyncio.Task] = {}


async def send_event(ws: WebSocket, event: str, data: dict) -> None:
    await ws.send_json({"event": event, "data": data})


def _load_db_messages(db, session_id: str) -> list[dict]:
    """Load conversation history from DB as plain dicts for the agent."""
    messages = (
        db.query(Message)
        .filter(Message.session_id == session_id)
        .order_by(Message.created_at.asc())
        .all()
    )
    return [
        {
            "role": msg.role,
            "type": msg.type or "text",
            "text": msg.text,
            "plot_data": msg.plot_data,
        }
        for msg in messages
    ]


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

    # Verify session ownership and get file path
    db = SessionLocal()
    try:
        session = db.query(Session).filter(
            Session.id == session_id,
            Session.user_id == user_id,
        ).first()
        if not session:
            await websocket.close(code=1008, reason="Session not found")
            return

        file_record = db.query(File).filter(File.session_id == session_id).first()
        if not file_record:
            await websocket.close(code=1008, reason="No file in session")
            return

        file_path = file_record.path_on_disk
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
                await handle_message(websocket, session_id, file_path, data.get("text", ""))
            elif msg_type == "auto_analyze":
                await handle_auto_analyze(websocket, session_id, file_path)
            elif msg_type == "stop":
                await handle_stop(websocket, session_id)
            else:
                await send_event(websocket, "error", {"message": f"Unknown message type: {msg_type}"})

    except WebSocketDisconnect:
        # Clean up any running task
        task = _active_tasks.pop(session_id, None)
        if task:
            task.cancel()
    except Exception as e:
        try:
            await send_event(websocket, "error", {"message": str(e)})
            await send_event(websocket, "done", {"data_updated": False})
        except Exception:
            pass


async def handle_message(ws: WebSocket, session_id: str, file_path: str, text: str) -> None:
    db = SessionLocal()
    try:
        save_user_message(db, session_id, text)

        db_messages = _load_db_messages(db, session_id)

        _send = partial(send_event, ws)

        task = asyncio.create_task(
            run_agent(
                session_id=session_id,
                file_path=file_path,
                is_initial_analysis=False,
                send_event=_send,
                db=db,
                db_messages=db_messages,
            )
        )
        _active_tasks[session_id] = task

        try:
            await task
        except asyncio.CancelledError:
            await send_event(ws, "done", {"data_updated": False})
        except Exception as e:
            await send_event(ws, "error", {"message": str(e)})
            await send_event(ws, "done", {"data_updated": False})
        finally:
            _active_tasks.pop(session_id, None)
    finally:
        db.close()


async def handle_auto_analyze(ws: WebSocket, session_id: str, file_path: str) -> None:
    db = SessionLocal()
    try:
        _send = partial(send_event, ws)

        task = asyncio.create_task(
            run_agent(
                session_id=session_id,
                file_path=file_path,
                is_initial_analysis=True,
                send_event=_send,
                db=db,
            )
        )
        _active_tasks[session_id] = task

        try:
            await task
        except asyncio.CancelledError:
            await send_event(ws, "done", {"data_updated": False})
        except Exception as e:
            await send_event(ws, "error", {"message": str(e)})
            await send_event(ws, "done", {"data_updated": False})
        finally:
            _active_tasks.pop(session_id, None)
    finally:
        db.close()


async def handle_stop(ws: WebSocket, session_id: str) -> None:
    task = _active_tasks.pop(session_id, None)
    if task:
        task.cancel()
    else:
        await send_event(ws, "done", {"data_updated": False})
