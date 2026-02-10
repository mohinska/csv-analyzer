import json

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, status
from sqlalchemy.orm import Session as DBSession

from backend.app.config import settings
from backend.app.database import get_db
from backend.app.dependencies.auth import get_current_user
from backend.app.models.user import User
from backend.app.models.session import Session
from backend.app.models.file import File as FileModel
from backend.app.schemas.upload import UploadResponse, FileInfoResponse
from backend.app.services.file_service import (
    validate_extension,
    save_upload,
    validate_and_preview,
    cleanup_session_dir,
)

router = APIRouter()


@router.post("/upload", response_model=UploadResponse)
def upload_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: DBSession = Depends(get_db),
):
    # Validate extension
    filename = file.filename or "unknown"
    try:
        validate_extension(filename)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    # Read file content and check size
    content = file.file.read()
    if len(content) == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File is empty")
    if len(content) > settings.MAX_UPLOAD_SIZE:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="File exceeds 1 GB size limit")

    # Create session
    session = Session(user_id=current_user.id, title=filename)
    db.add(session)
    db.commit()
    db.refresh(session)

    # Save file to disk
    try:
        file_path = save_upload(session.id, filename, content)
    except Exception as e:
        db.delete(session)
        db.commit()
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail=f"Failed to save file: {e}")

    # Validate with DuckDB and get preview
    try:
        file_info = validate_and_preview(file_path)
    except ValueError as e:
        cleanup_session_dir(session.id)
        db.delete(session)
        db.commit()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e))

    # Create file record
    file_record = FileModel(
        session_id=session.id,
        filename=filename,
        path_on_disk=file_path,
        row_count=file_info["row_count"],
        col_count=file_info["column_count"],
        columns=json.dumps(file_info["columns"]),
        profile_data=json.dumps({
            "column_types": file_info["column_types"],
            "column_profiles": file_info["column_profiles"],
        }),
    )
    db.add(file_record)
    db.commit()

    return UploadResponse(
        session_id=session.id,
        file=FileInfoResponse(
            filename=filename,
            row_count=file_info["row_count"],
            column_count=file_info["column_count"],
            columns=file_info["columns"],
            preview=file_info["preview"],
        ),
    )
