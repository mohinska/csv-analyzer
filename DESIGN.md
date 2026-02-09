# Backend Rewrite — Design Decisions

## Overview
Rewriting the backend from scratch. Same stack (Python + FastAPI), completely new API design. Frontend kept, cleaned up.

## Frontend Changes Made
- **Removed** hardcoded auto-analysis prompt from App.tsx — frontend now sends `"__auto_analyze__"`, backend owns the prompt
- **Removed** `getCodeSnippet` fallback — backend must always provide `code_snippet` with plots
- **Removed** PlotsTab — plots are derived from chat messages via `useMemo`, no separate state/endpoint
- **Removed** `GET /api/plots` fetch, `handleSavePlotFromPanel`, off-screen export portal, `exportPlot` state
- **Added** History tab (Data | History) in left sidebar — placeholder, will show session list from `GET /api/sessions`

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
| POST | `/api/sessions` | Create new session (authed) |
| GET | `/api/sessions` | List all user sessions (for History tab) |
| GET | `/api/sessions/{id}` | Get single session + metadata (restore on mount) |
| DELETE | `/api/sessions/{id}` | Delete session |

### Upload
| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/sessions/{id}/upload` | Upload CSV/Parquet file |

### Data
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/sessions/{id}/preview` | Data preview (supports `?rows=N&version=current|original`) |

### Chat
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/sessions/{id}/messages` | Restore chat history |
| WebSocket | `/api/sessions/{id}/ws` | Chat streaming (replaces SSE) |

### Total: 9 REST endpoints + 1 WebSocket

## Dropped Endpoints
- ~~`GET /api/plots/{id}`~~ — plots derived from messages
- ~~`POST /api/chat/{id}/message`~~ — WebSocket owns all message persistence
- ~~`GET /api/suggestions/{id}`~~ — suggestions come through WebSocket `done` event only
- ~~`GET /api/health`~~ — add later if needed
- ~~`GET /api/summary/{id}`~~ — backend handles internally, not exposed
- ~~`POST /api/query`~~ — queries go through chat, not a separate endpoint

## Streaming: WebSocket (not SSE)
- Single WS connection per session: `/api/sessions/{id}/ws`
- Bidirectional: client sends messages, server streams responses
- Same event types the frontend already handles: `text`, `plot`, `query_result`, `status`, `done`, `error`, `judge`
- `done` event includes `suggestions` array (only source of suggestions now)
- Frontend sends `{ type: "message", text: "..." }` or `{ type: "auto_analyze" }`
- Server sends `{ event: "text", data: {...} }` etc.
- Clean stop/cancel via WS close or client `{ type: "stop" }` message

## Message Persistence
- **Chat endpoint (WebSocket) owns all persistence**
- No separate "save message" call from frontend
- Backend saves user messages when received via WS, saves assistant messages as they're generated
- Frontend only reads messages via `GET /api/sessions/{id}/messages` on session restore

## Suggestions
- **Removed entirely for now** — no suggestion chips in frontend, no suggestions endpoint
- Can re-add later through WebSocket `done` event if needed

## Auto-Analysis
- Frontend sends `"__auto_analyze__"` via WebSocket after file upload
- Backend recognizes this as a trigger and runs its own analysis prompt
- The prompt content lives entirely in the backend

## Data Versioning
- **Removed for now** — single version of the data (the uploaded original)
- No current/original toggle, no `?version=` query param
- Can re-add later if data transformation features need it
- Upload saves original file to disk (never modified)
- Transformations update `current` version
- `GET /api/sessions/{id}/preview?version=current|original` serves either
- `rows=99999` pattern still works but consider adding proper pagination later

## What to Keep from Old Backend (as reference)
- DuckDB for query execution — fast, works well for analytical SQL
- SQL sanitization (block DDL/DML, allow only SELECT/WITH)
- Tool-use pattern: `write_to_chat`, `generate_query`, `create_plot`, `finish`
- Plot code sanitization (block dangerous imports/functions)
