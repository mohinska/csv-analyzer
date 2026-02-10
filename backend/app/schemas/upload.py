from typing import Any

from pydantic import BaseModel


class FileInfoResponse(BaseModel):
    filename: str
    row_count: int
    column_count: int
    columns: list[str]
    preview: list[dict[str, Any]]


class UploadResponse(BaseModel):
    session_id: str
    file: FileInfoResponse
