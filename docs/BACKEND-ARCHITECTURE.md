# Backend Architecture

## Stack

- **Framework**: FastAPI 0.115.6 + Uvicorn
- **Database**: SQLite via SQLAlchemy 2.0 + Alembic migrations
- **Data Engine**: DuckDB 1.2.1 (CSV/Parquet validation & queries)
- **Auth**: JWT (PyJWT, HS256, 30-day expiry) + bcrypt passwords
- **AI**: Anthropic Claude (not yet connected — WS returns stub responses)

## Running Locally

```bash
# From project root
source venv/bin/activate
PYTHONPATH=. alembic -c backend/alembic.ini upgrade head
PYTHONPATH=. uvicorn backend.main:app --port 8001 --reload
```

Frontend dev proxy (`vite.config.ts`) forwards `/api` to `localhost:8001` with `ws: true`.

## Project Structure

```
backend/
  __init__.py
  main.py                            # FastAPI app, CORS, router mounts
  requirements.txt
  alembic.ini
  alembic/
    env.py
    script.py.mako
    versions/
      001_initial_schema.py           # users, sessions, files, messages tables
  app/
    config.py                         # Settings: SECRET_KEY, DATABASE_URL, DATA_DIR, etc.
    database.py                       # SQLAlchemy engine, SessionLocal, Base, get_db()
    models/
      user.py                         # User: id, email, password_hash, created_at
      session.py                      # Session: id, user_id (FK), title, created_at
      file.py                         # File: id, session_id (FK), filename, path_on_disk, row/col counts, columns (JSON)
      message.py                      # Message: id, session_id (FK), role, text, type, plot_data (JSON), created_at
    schemas/
      auth.py                         # AuthRequest, AuthResponse
      upload.py                       # FileInfoResponse, UploadResponse
      sessions.py                     # SessionSummary, SessionDetail, MessageResponse
    routers/
      auth.py                         # POST /register, /login
      upload.py                       # POST /upload
      sessions.py                     # GET/DELETE /sessions, GET /sessions/{id}
      ws.py                           # WS /sessions/{id}/ws
    dependencies/
      auth.py                         # get_current_user (Bearer token -> User)
    services/
      file_service.py                 # DuckDB validation, file storage, preview extraction
    utils/
      security.py                     # hash/verify password, create/decode JWT
```

## API Endpoints

### Auth

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/auth/register` | No | Create account, returns `{ token }` |
| POST | `/api/auth/login` | No | Login, returns `{ token }` |

Request: `{ "email": "...", "password": "..." }`
Response: `{ "token": "jwt-string" }`
Errors: `{ "detail": "error message" }`

### Upload

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/api/upload` | Bearer | Upload CSV/Parquet, creates session |

Request: `multipart/form-data` with `file` field
Response:
```json
{
  "session_id": "uuid",
  "file": {
    "filename": "data.csv",
    "row_count": 5000,
    "column_count": 12,
    "columns": ["col1", "col2"],
    "preview": [{"col1": "Alice", "col2": 30}, ...]
  }
}
```

Validation: `.csv`/`.parquet`/`.pq` only, max 1 GB, DuckDB must parse it.

### Sessions

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/sessions` | Bearer | List user's sessions (recent first) |
| GET | `/api/sessions/{id}` | Bearer | Session detail + file preview + messages |
| DELETE | `/api/sessions/{id}` | Bearer | Delete session + files on disk |

GET detail returns fresh DuckDB preview (re-reads file each time).
Owner-only access — returns 404 for other users' sessions.

### WebSocket

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| WS | `/api/sessions/{id}/ws?token=jwt` | Query param | Real-time chat |

**Client -> Server:**
```json
{ "type": "message", "text": "show me top 10" }
{ "type": "auto_analyze" }
{ "type": "stop" }
```

**Server -> Client:**
```json
{ "event": "text",           "data": { "text": "..." } }
{ "event": "plot",           "data": { "title": "...", "vega_lite_spec": {...} } }
{ "event": "query_result",   "data": { "result": [...], "is_error": false } }
{ "event": "status",         "data": { "message": "Running query..." } }
{ "event": "done",           "data": { "data_updated": false } }
{ "event": "error",          "data": { "message": "..." } }
{ "event": "session_update", "data": { "title": "New Title" } }
```

Currently returns stub responses. AI agent integration is next.

## Database Schema

```sql
users:     id (UUID PK), email (unique), password_hash, created_at
sessions:  id (UUID PK), user_id (FK->users CASCADE), title, created_at
files:     id (UUID PK), session_id (FK->sessions CASCADE), filename, path_on_disk, row_count, col_count, columns (JSON)
messages:  id (UUID PK), session_id (FK->sessions CASCADE), role, text, type, plot_data (JSON), created_at
```

All IDs are UUID strings (SQLite has no native UUID type).
Cascade deletes: deleting a session removes its files and messages.

## File Storage

```
data/{session_id}/original.csv    # or .parquet
```

Cleanup on session delete via `cleanup_session_dir()`.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `SECRET_KEY` | `change-me-in-production` | JWT signing key |
| `DATABASE_URL` | `sqlite:///./data_analyzer.db` | SQLAlchemy database URL |
| `ACCESS_TOKEN_EXPIRE_DAYS` | `30` | JWT token lifetime |
| `ANTHROPIC_API_KEY` | (empty) | Claude API key (for future AI agent) |
| `DATA_DIR` | `data` | Directory for uploaded files |
| `MAX_UPLOAD_SIZE` | `1073741824` | Max file size in bytes (1 GB) |

Set via `.env` file in project root or environment variables.

## What's Next

- [ ] Claude AI agent integration (replace WS stubs with real LLM responses)
- [ ] DuckDB query execution within chat (generate_query tool)
- [ ] Vega-Lite plot generation (create_plot tool)
- [ ] Session title generation after first exchange
- [ ] Auto-analyze with real data insights
