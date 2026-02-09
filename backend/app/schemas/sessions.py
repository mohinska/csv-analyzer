from datetime import datetime
from typing import Any

from pydantic import BaseModel

from backend.app.schemas.upload import FileInfoResponse


class SessionSummary(BaseModel):
    id: str
    title: str | None
    created_at: datetime


class MessageResponse(BaseModel):
    id: int
    role: str
    text: str
    type: str | None = None
    plot_title: str | None = None
    plot_data: dict[str, Any] | None = None


class SessionDetail(BaseModel):
    id: str
    title: str | None
    created_at: datetime
    file: FileInfoResponse | None
    messages: list[MessageResponse]
