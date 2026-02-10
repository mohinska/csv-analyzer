# Backend Rewrite — Design Decisions

## Overview
Rewriting the backend from scratch. Same stack (Python + FastAPI), completely new API design. Frontend kept, cleaned up.

## Frontend Changes Made
- **Removed** hardcoded auto-analysis prompt — frontend sends `"__auto_analyze__"` via WS, backend owns the prompt
- **Removed** `getCodeSnippet` fallback, PlotsTab, `GET /api/plots` fetch, plot export portal
- **Removed** SSE streaming (`sendChatMessage`, `handleSSEEvent`) — replaced with WebSocket
- **Removed** `abortControllerRef` — stop/cancel now via WS `{ type: "stop" }`
- **Removed** judge system entirely (`JudgeVerdict` interface, event handler, verdict display)
- **Added** AuthPage — login/signup with JWT, token stored in localStorage
- **Added** History tab (Data | History) in left sidebar — placeholder, will show session list
- **Added** WebSocket connection with auto-reconnect (exponential backoff, 5 retries)
- **Added** Client-side 1 GB file size check before upload
- **Changed** session creation — now happens on upload (`POST /api/upload`), not on mount
- **Changed** session restore — single `GET /api/sessions/{id}` call, no session creation fallback
- **Changed** `handleFileUpload` — queues `auto_analyze` for WS `onopen`, loading state cleared by `done` event
- **Changed** `handleSend` — synchronous, sends via WS, checks connection state
- **Changed** `handleNewChat` — synchronous state clear, WS closes via useEffect cleanup
- **Changed** drag-and-drop blocked when session exists (one file per session, no re-upload)
- **Changed** fullscreen data modal uses `fileInfo.preview` directly (no full data fetch)
- **Changed** upload errors surfaced to user with actual backend message

## Auth
- **JWT tokens**, stateless
- **Long-lived single token** (30 day expiry) — no refresh token, no rotation
- **Email + password only** at registration
- Token stored in localStorage, sent as `Authorization: Bearer <token>`
- Server signs with `SECRET_KEY` env var, verifies on every request
- Can't revoke tokens once issued (acceptable tradeoff for a data tool)
- **Future mitigation**: add `token_version` column to users table, bump on password change, check on every request

## Database
- Proper DB instead of file-based JSON/CSV storage
- SQLite (single server) or Postgres (if scaling later)
- Schema:
  ```
  users:     id, email, password_hash, created_at
  sessions:  id, user_id (FK), title, created_at
  files:     id, session_id (FK), filename, path_on_disk, row_count, col_count, columns
  messages:  id, session_id (FK), role, text, type, plot_data (JSON), created_at
  ```
- No separate plots table — plot data lives in the `messages` table as JSON (Vega-Lite spec)

## Plots
- **Vega-Lite** — LLM produces a Vega-Lite JSON spec, frontend renders with `vega-embed`
- Vega-Lite is a well-known declarative visualization grammar; LLMs know it well
- Stored as a single JSON blob in the message's `plot_data` column
- Frontend renders SVG (crisp), with built-in tooltips, zoom/pan
- Custom dark theme config to match the app's UI
- **No code_snippet** — dropped entirely (no "Copy Code" button, no Python fallback)
- **Production approach**: LLM calls a `create_plot` tool, returns `{ title, vega_lite_spec }`, backend validates and streams as a `plot` event

## Endpoints

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/auth/register` | Create account (email + password) → returns JWT |
| POST | `/api/auth/login` | Login → returns JWT |

### Sessions
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/sessions` | List all user sessions (for History tab) |
| GET | `/api/sessions/{id}` | Get single session (file info + messages + metadata) |
| DELETE | `/api/sessions/{id}` | Delete session |

- **No `POST /api/sessions`** — sessions are created implicitly by upload
- `GET /api/sessions/{id}` returns everything needed for restore: `{ id, title, created_at, file: { filename, row_count, column_count, columns, preview }, messages: [...] }`
- One fetch to restore a session — no separate preview or messages call

### Upload
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/upload` | Upload file → creates session → returns `{ session_id, file: { filename, row_count, column_count, columns, preview } }` |

- **Upload creates the session** — no session exists until a file is uploaded
- One file per session, no re-upload
- Frontend cannot chat without a file (input disabled until upload)
- "New chat" clears state and returns to upload screen
- DataTab only shows preview rows from the upload response (no full data fetch)

### Chat
| Method | Path | Description |
|--------|------|-------------|
| WebSocket | `/api/sessions/{id}/ws` | Chat streaming (replaces SSE) |

- Messages restored inline via `GET /api/sessions/{id}`, no separate messages endpoint

### Total: 6 REST endpoints + 1 WebSocket

## Dropped Endpoints
- ~~`POST /api/sessions`~~ — sessions created implicitly by upload
- ~~`GET /api/sessions/{id}/messages`~~ — messages returned inline by `GET /api/sessions/{id}`
- ~~`GET /api/plots/{id}`~~ — plots derived from messages
- ~~`POST /api/chat/{id}/message`~~ — WebSocket owns all message persistence
- ~~`GET /api/suggestions/{id}`~~ — suggestions come through WebSocket `done` event only
- ~~`GET /api/health`~~ — add later if needed
- ~~`GET /api/summary/{id}`~~ — backend handles internally, not exposed
- ~~`POST /api/query`~~ — queries go through chat, not a separate endpoint

## Streaming: WebSocket (not SSE)
- Single WS connection per session: `/api/sessions/{id}/ws?token=xxx`
- **Auth**: JWT passed as query param on connect — server validates before accepting
- **Lifecycle**: connect when sessionId is set (after upload or restore), keep alive while session is active, close on new chat / logout
- **Reconnection**: auto-reconnect with exponential backoff (1s → 2s → 4s → max 30s), cap at 5 retries, then show "Connection lost" error
- **Stop/Cancel**: client sends `{ type: "stop" }`, server aborts LLM call and sends `done` event to confirm
- Bidirectional: client sends messages, server streams responses
- Event types: `text`, `plot`, `query_result`, `status`, `done`, `error`, `session_update`
- **No judge** — removed entirely

### Client → Server messages
```json
{ "type": "message", "text": "show me top 10" }
{ "type": "auto_analyze" }
{ "type": "stop" }
```

### Server → Client messages
```json
{ "event": "text", "data": { "text": "Here are the top 10..." } }
{ "event": "plot", "data": { "title": "...", "vega_lite_spec": { ... } } }
{ "event": "query_result", "data": { "result": [...], "is_error": false } }
{ "event": "status", "data": { "message": "Running query..." } }
{ "event": "done", "data": { "data_updated": false } }
{ "event": "error", "data": { "message": "Something went wrong" } }
{ "event": "session_update", "data": { "title": "Sales Analysis Q4" } }
```

## Message Persistence
- **Chat endpoint (WebSocket) owns all persistence**
- No separate "save message" call from frontend
- Backend saves user messages when received via WS, saves assistant messages as they're generated
- Frontend restores messages via `GET /api/sessions/{id}` (inline with session data)

## Suggestions
- **Removed entirely for now** — no suggestion chips in frontend, no suggestions endpoint
- Can re-add later through WebSocket `done` event if needed

## Sessions
- **Created on upload** — no session exists until user uploads a file (`POST /api/upload`)
- **No empty sessions** — every session has a file attached
- **One file per session** — no re-upload; to analyze a different file, start a new session
- **No chat without data** — chat input disabled until file is uploaded
- **"New chat" button** clears all state (sessionId, fileInfo, messages) and returns to upload screen
- **Restore on mount**: frontend checks localStorage for `csv_analyzer_session_id`, calls `GET /api/sessions/{id}` to restore file + messages in one request
- **Title**: starts as filename, LLM generates a real title after first exchange (backend sends `session_update` event via WS)

## Upload & Files
- **Storage**: keep original file on disk, DuckDB queries it directly (no import step)
- **Directory**: `data/{session_id}/original.csv` (or `.parquet`) — nested per session
- **Size limit**: 1 GB (enforced by backend, matches Docker/nginx config)
- **Preview**: 500 rows returned in the upload response
- **Accepted formats**: `.csv`, `.parquet`, `.pq`
- **Validation on upload**:
  - File extension check
  - File not empty
  - DuckDB can parse it without errors
  - Column count > 0, row count > 0
  - Clear error messages: "File is empty", "Could not parse CSV", etc.
- **Cleanup on session delete**: delete file from disk + all DB rows (session, file, messages)
- No background cleanup job for now — just delete on `DELETE /api/sessions/{id}`

## Auto-Analysis
- Frontend sends `"__auto_analyze__"` via WebSocket after file upload
- Backend recognizes this as a trigger and runs its own analysis prompt
- The prompt content lives entirely in the backend

## Data Versioning
- **Removed for now** — single version of the data (the uploaded original)
- No current/original toggle, no `?version=` query param
- Can re-add later if data transformation features need it

## What to Keep from Old Backend (as reference)
- DuckDB for query execution — fast, works well for analytical SQL
- SQL sanitization (block DDL/DML, allow only SELECT/WITH)
- Tool-use pattern: `write_to_chat`, `generate_query`, `create_plot`, `finish`
- Plot code sanitization (block dangerous imports/functions)
