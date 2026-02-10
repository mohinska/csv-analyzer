import json
import asyncio
import logging
from functools import partial
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query

from backend.app.database import SessionLocal
from backend.app.models.session import Session
from backend.app.models.file import File
from backend.app.models.message import Message
from backend.app.utils.security import decode_access_token
from backend.app.agent.graph import run_agent
from backend.app.agent.persistence import save_user_message

logger = logging.getLogger("agent.ws")

router = APIRouter()

# Track running agent tasks so we can cancel on "stop"
_active_tasks: dict[str, asyncio.Task] = {}


async def send_event(ws: WebSocket, event: str, data: dict) -> None:
    if event != "text_delta":  # text_delta is too noisy
        logger.debug("WS send: event=%s data_keys=%s", event, list(data.keys()))
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
        logger.warning("WS auth failed for session=%s", session_id)
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

    # Build file_metadata from stored profile (avoids re-scanning at agent start)
    file_metadata = _build_file_metadata(file_record)

    await websocket.accept()
    logger.info("WS connected: session=%s user=%s", session_id, user_id)

    try:
        while True:
            raw = await websocket.receive_text()

            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                logger.warning("WS received invalid JSON: %s", raw[:100])
                await send_event(websocket, "error", {"message": "Invalid JSON"})
                continue

            msg_type = data.get("type")
            logger.info("WS received: type=%s session=%s", msg_type, session_id)

            if msg_type == "message":
                logger.info("User message: %s", data.get("text", "")[:200])
                await handle_message(websocket, session_id, file_path, file_metadata, data.get("text", ""))
            elif msg_type == "auto_analyze":
                await handle_auto_analyze(websocket, session_id, file_path, file_metadata)
            elif msg_type == "stop":
                logger.info("User requested stop for session=%s", session_id)
                await handle_stop(websocket, session_id)
            else:
                await send_event(websocket, "error", {"message": f"Unknown message type: {msg_type}"})

    except WebSocketDisconnect:
        logger.info("WS disconnected: session=%s", session_id)
        # Clean up any running task
        task = _active_tasks.pop(session_id, None)
        if task:
            task.cancel()
    except Exception as e:
        logger.exception("WS error for session=%s: %s", session_id, e)
        try:
            await send_event(websocket, "error", {"message": str(e)})
            await send_event(websocket, "done", {"data_updated": False})
        except Exception:
            pass


async def handle_message(ws: WebSocket, session_id: str, file_path: str, file_metadata: dict[str, Any], text: str) -> None:
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
                file_metadata=file_metadata,
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


async def handle_auto_analyze(ws: WebSocket, session_id: str, file_path: str, file_metadata: dict[str, Any]) -> None:
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
                file_metadata=file_metadata,
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


def _build_file_metadata(file_record: File) -> dict[str, Any]:
    """Build file_metadata dict from the DB file record + stored profile."""
    profile = {}
    if file_record.profile_data:
        try:
            profile = json.loads(file_record.profile_data)
        except (json.JSONDecodeError, TypeError):
            pass

    column_types = profile.get("column_types", {})
    # Fallback: if no profile yet, build column_types from columns list
    if not column_types and file_record.columns:
        try:
            cols = json.loads(file_record.columns)
            column_types = {c: "UNKNOWN" for c in cols}
        except (json.JSONDecodeError, TypeError):
            pass

    return {
        "row_count": file_record.row_count,
        "col_count": file_record.col_count,
        "column_types": column_types,
        "column_profiles": profile.get("column_profiles"),
    }
