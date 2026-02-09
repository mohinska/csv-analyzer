"""Message persistence helpers for the agent."""

from sqlalchemy.orm import Session as DBSession

from backend.app.models.message import Message

# Map tool names to message types stored in the DB
_TOOL_TYPE_MAP = {
    "output_text": "text",
    "output_table": "table",
    "create_plot": "plot",
    "sql_query": "query_result",
}


def save_user_message(db: DBSession, session_id: str, text: str) -> None:
    msg = Message(
        session_id=session_id,
        role="user",
        text=text,
        type="text",
    )
    db.add(msg)
    db.commit()


def save_reasoning(db: DBSession, session_id: str, text: str) -> None:
    msg = Message(
        session_id=session_id,
        role="assistant",
        text=text,
        type="reasoning",
    )
    db.add(msg)
    db.commit()


def save_tool_message(
    db: DBSession,
    session_id: str,
    tool_name: str,
    text: str,
    plot_data: str | None,
) -> None:
    msg_type = _TOOL_TYPE_MAP.get(tool_name, "text")
    msg = Message(
        session_id=session_id,
        role="assistant",
        text=text,
        type=msg_type,
        plot_data=plot_data,
    )
    db.add(msg)
    db.commit()
