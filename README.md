# Data Analyzer

AI-powered data analysis through natural language. Upload a CSV or Parquet file, ask questions in plain English, get tables, statistics, and visualizations — all in a chat interface.

## Features

- **Natural language queries** — ask questions about your data, get answers with statistics, tables, and insights
- **Vega-Lite visualizations** — bar, line, scatter, histogram, pie, box, heatmap, and area charts
- **CSV & Parquet support** — automatic type detection, column profiling, up to 1 GB files
- **Agentic architecture** — Claude autonomously decides what SQL to run, what charts to create, and how to present results
- **Real-time streaming** — WebSocket connection delivers agent responses as they're generated
- **Auto-analysis** — after upload, the agent automatically profiles your dataset and provides initial insights
- **Session management** — each upload creates an isolated session with its own data and chat history
- **User accounts** — JWT-based authentication with per-user session isolation
- **LaTeX rendering** — statistical formulas rendered with KaTeX
- **DuckDB engine** — fast analytical SQL with window functions, CTEs, and statistical aggregates

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- [Anthropic API key](https://console.anthropic.com/)

### Setup

```bash
git clone <repo-url>
cd data-analyzer

# Configure environment
cp .env.example .env
# Edit .env and add your ANTHROPIC_API_KEY
```

### Run with Docker (recommended)

```bash
cd docker
docker compose up --build
```

App available at **http://localhost:3000**. Backend API at **http://localhost:8001**.

Docker handles database migrations, persistent storage, and nginx reverse proxy automatically.

### Run locally

**Backend:**

```bash
python3 -m venv venv
source venv/bin/activate

pip install -r backend/requirements.txt
alembic -c backend/alembic.ini upgrade head
python3 -m backend.main
```

Backend runs at **http://localhost:8001**.

**Frontend:**

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at **http://localhost:3000**. Vite proxies `/api` requests to the backend.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│              React Frontend (:3000)                  │
│  Auth ─► Upload ─► WebSocket Chat                   │
│  DataTab  │  PlotsTab  │  Chat Panel                │
└────────────────────┬────────────────────────────────┘
                     │ REST + WebSocket
┌────────────────────▼────────────────────────────────┐
│             FastAPI Backend (:8001)                  │
│                                                     │
│  Auth (JWT) ─► Upload ─► Session ─► WebSocket       │
│                                        │            │
│                              Agent Loop (Claude)    │
│                           ┌────┬────┬────┬────┐    │
│                           ▼    ▼    ▼    ▼    ▼    │
│                       sql  output output plot final │
│                       query text   table       ize  │
│                         │                           │
│                    DuckDB (read-only SQL)            │
│                         │                           │
│                  SQLite (users, sessions, messages)  │
└─────────────────────────────────────────────────────┘
```

### How It Works

1. **Register/Login** — create an account, receive a JWT token
2. **Upload** — upload a CSV or Parquet file; creates a session with column profiling
3. **Auto-analyze** — the agent runs an initial analysis of the dataset
4. **Chat** — ask questions via WebSocket; the agent enters a tool-use loop (max 15 iterations):
   - `sql_query` — execute read-only DuckDB SQL against the dataset
   - `output_text` — send markdown text to the user
   - `output_table` — send a structured table
   - `create_plot` — send a Vega-Lite visualization spec
   - `finalize` — end the turn, optionally set session title
5. **Stream** — each tool result is streamed to the frontend in real time

## Tech Stack

**Backend:**
- FastAPI + Uvicorn
- Anthropic Claude API (tool-use)
- DuckDB (analytical SQL engine)
- SQLAlchemy 2.0 + Alembic (ORM & migrations)
- SQLite (metadata database)
- PyJWT + Bcrypt (authentication)
- Pydantic v2 (validation & settings)

**Frontend:**
- React 18 + TypeScript
- Vite 6
- Vega-Lite + Vega-Embed (visualizations)
- Tailwind CSS
- Radix UI (component primitives)
- KaTeX (math rendering)
- Lucide React (icons)

## Project Structure

```
├── backend/
│   ├── main.py                  # FastAPI app entry point
│   ├── app/
│   │   ├── config.py            # Pydantic settings (.env)
│   │   ├── database.py          # SQLAlchemy engine & session
│   │   ├── agent/
│   │   │   ├── graph.py         # Agent loop (Claude tool-use)
│   │   │   ├── tools.py         # Tool executors (SQL, text, plot)
│   │   │   ├── context.py       # System prompts & data summary
│   │   │   ├── persistence.py   # Message storage
│   │   │   └── sql_sanitizer.py # SQL validation (blocks DML/DDL)
│   │   ├── models/              # SQLAlchemy models
│   │   ├── routers/             # API endpoints
│   │   ├── schemas/             # Pydantic request/response models
│   │   ├── services/            # File handling & DuckDB
│   │   ├── dependencies/        # Auth middleware
│   │   └── utils/               # JWT & password hashing
│   ├── alembic/                 # Database migrations
│   ├── alembic.ini              # Alembic configuration
│   └── tests/                   # Pytest test suite
├── frontend/
│   ├── src/
│   │   ├── App.tsx              # Main app (auth, chat, WS)
│   │   └── components/          # UI components
│   └── package.json
├── docker/
│   ├── docker-compose.yml
│   ├── Dockerfile.backend
│   ├── Dockerfile.frontend
│   └── nginx.conf
└── .env.example
```

## API Endpoints

### REST

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/auth/register` | Create account |
| `POST` | `/api/auth/login` | Login, receive JWT |
| `POST` | `/api/upload` | Upload file, create session |
| `GET` | `/api/sessions` | List user's sessions |
| `GET` | `/api/sessions/{id}` | Get session detail (file, messages) |
| `DELETE` | `/api/sessions/{id}` | Delete session and data |

### WebSocket

| Endpoint | Description |
|----------|-------------|
| `WS /api/sessions/{id}/ws?token=<jwt>` | Real-time chat |

**Client messages:**
- `{"type": "message", "text": "..."}` — send a question
- `{"type": "auto_analyze"}` — trigger initial analysis
- `{"type": "stop"}` — cancel running agent

**Server events:**
- `status` — progress indicator
- `text` — markdown text from agent
- `table` — structured table data
- `plot` — Vega-Lite visualization spec
- `query_result` — SQL query + result rows
- `session_update` — title changed
- `error` — error message
- `done` — turn complete

## Configuration

All settings are read from `.env` in the project root (via Pydantic settings):

```env
# Required
ANTHROPIC_API_KEY=your-api-key-here

# Optional
SECRET_KEY=change-me-in-production    # JWT signing key
DATABASE_URL=sqlite:///./data_analyzer.db
DATA_DIR=data                         # Upload storage directory
MAX_UPLOAD_SIZE=1073741824            # 1 GB
ACCESS_TOKEN_EXPIRE_DAYS=30
```

## Docker

The `docker/` directory contains a production-ready Docker Compose setup.

### Services

- **backend** — Python 3.11, runs Alembic migrations on startup, serves API on port 8001
- **frontend** — Node 20 build stage + nginx, serves static files on port 3000, proxies `/api` to backend

### Volumes

- `app-data` — persists uploaded files across container restarts
- `db-data` — persists the SQLite database

### Commands

```bash
# Start
cd docker
docker compose up --build

# Start in background
docker compose up --build -d

# View logs
docker compose logs -f

# Stop
docker compose down

# Stop and remove volumes (deletes all data)
docker compose down -v
```

## Database

SQLite with SQLAlchemy ORM. Four tables:

- **users** — email, bcrypt password hash
- **sessions** — per-user, linked to uploaded file
- **files** — filename, path on disk, row/column counts, column profiles (JSON)
- **messages** — chat history (role, text, type, optional plot_data JSON)

Migrations managed by Alembic. Run manually with:

```bash
alembic -c backend/alembic.ini upgrade head
```

## Security

- **JWT authentication** — stateless tokens, 30-day expiry
- **SQL sanitization** — regex blocks INSERT, UPDATE, DELETE, DROP, ALTER, TRUNCATE
- **Query limits** — results capped at 50 rows, plot data at 100 rows
- **Session isolation** — users can only access their own sessions
- **Input validation** — Pydantic models on all endpoints
- **File size limit** — 1 GB maximum upload

## Testing

```bash
cd backend
python -m pytest tests/ -v
```
