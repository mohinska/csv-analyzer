from pydantic import BaseModel
from typing import Optional
from datetime import datetime


# Session & File models
class SessionInfo(BaseModel):
    session_id: str
    has_file: bool
    filename: Optional[str] = None
    row_count: Optional[int] = None
    column_count: Optional[int] = None
    columns: Optional[list[str]] = None
    created_at: datetime


class UploadResponse(BaseModel):
    session_id: str
    filename: str
    row_count: int
    column_count: int
    columns: list[str]
    preview: list[dict]  # First 5 rows
    message: str


class SessionStatusResponse(BaseModel):
    has_file: bool
    session: Optional[SessionInfo] = None
