from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session as DBSession

from backend.app.database import get_db
from backend.app.models.user import User
from backend.app.schemas.auth import AuthRequest, AuthResponse
from backend.app.utils.security import hash_password, verify_password, create_access_token

router = APIRouter()


@router.post("/register", response_model=AuthResponse)
def register(body: AuthRequest, db: DBSession = Depends(get_db)):
    existing = db.query(User).filter(User.email == body.email.lower().strip()).first()
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered",
        )

    if len(body.password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password must be at least 6 characters",
        )

    user = User(
        email=body.email.lower().strip(),
        password_hash=hash_password(body.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(user.id)
    return AuthResponse(token=token)


@router.post("/login", response_model=AuthResponse)
def login(body: AuthRequest, db: DBSession = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email.lower().strip()).first()

    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid email or password",
        )

    token = create_access_token(user.id)
    return AuthResponse(token=token)
