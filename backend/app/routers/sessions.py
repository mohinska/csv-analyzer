import json
import os

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session as DBSession

from backend.app.database import get_db
from backend.app.dependencies.auth import get_current_user
from backend.app.models.user import User
from backend.app.models.session import Session
from backend.app.models.file import File
from backend.app.models.message import Message
from backend.app.schemas.sessions import SessionSummary, SessionDetail, MessageResponse
from backend.app.schemas.upload import FileInfoResponse
from backend.app.services.file_service import validate_and_preview, cleanup_session_dir

router = APIRouter()


def _get_owned_session(
    session_id: str, user: User, db: DBSession
) -> Session:
    """Get a session owned by the user, or raise 404."""
    session = db.query(Session).filter(
        Session.id == session_id,
        Session.user_id == user.id,
    ).first()
    if not session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    return session


@router.get("/sessions", response_model=list[SessionSummary])
def list_sessions(
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    sessions = (
        db.query(Session)
        .filter(Session.user_id == current_user.id)
        .order_by(Session.created_at.desc())
        .all()
    )
    return [
        SessionSummary(id=s.id, title=s.title, created_at=s.created_at)
        for s in sessions
    ]


@router.get("/sessions/{session_id}", response_model=SessionDetail)
def get_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    session = _get_owned_session(session_id, current_user, db)

    # Get file info with fresh DuckDB preview
    file_info = None
    file_record = db.query(File).filter(File.session_id == session.id).first()
    if file_record and os.path.exists(file_record.path_on_disk):
        try:
            preview_data = validate_and_preview(file_record.path_on_disk)
            file_info = FileInfoResponse(
                filename=file_record.filename,
                row_count=preview_data["row_count"],
                column_count=preview_data["column_count"],
                columns=preview_data["columns"],
                preview=preview_data["preview"],
            )
        except ValueError:
            # File corrupted or unreadable — return without file info
            pass

    # Get messages ordered chronologically
    messages = (
        db.query(Message)
        .filter(Message.session_id == session.id)
        .order_by(Message.created_at.asc())
        .all()
    )

    message_responses = []
    for i, msg in enumerate(messages, start=1):
        # Skip reasoning messages — they're only for LLM context
        if msg.type == "reasoning":
            continue

        plot_data = None
        if msg.plot_data:
            try:
                plot_data = json.loads(msg.plot_data)
            except json.JSONDecodeError:
                pass

        plot_title = None
        if msg.type == "plot" and plot_data:
            plot_title = plot_data.get("title")

        message_responses.append(MessageResponse(
            id=i,
            role=msg.role,
            text=msg.text,
            type=msg.type,
            plot_title=plot_title,
            plot_data=plot_data,
        ))

    return SessionDetail(
        id=session.id,
        title=session.title,
        created_at=session.created_at,
        file=file_info,
        messages=message_responses,
    )


@router.delete("/sessions/{session_id}", status_code=status.HTTP_200_OK)
def delete_session(
    session_id: str,
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    session = _get_owned_session(session_id, current_user, db)

    # Clean up files on disk
    cleanup_session_dir(session.id)

    # Delete session (CASCADE removes files + messages rows)
    db.delete(session)
    db.commit()

    return {"ok": True}
