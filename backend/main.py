from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from backend.app.routers import auth as auth_router
from backend.app.routers import upload as upload_router
from backend.app.routers import sessions as sessions_router
from backend.app.routers import ws as ws_router

app = FastAPI(title="Data Analyzer API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router, prefix="/api/auth", tags=["auth"])
app.include_router(upload_router.router, prefix="/api", tags=["upload"])
app.include_router(sessions_router.router, prefix="/api", tags=["sessions"])
app.include_router(ws_router.router, prefix="/api", tags=["ws"])
