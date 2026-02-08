# Agent Forge — AI Data Analyzer

An AI-powered data analysis assistant that lets you upload CSV/Parquet files and explore them through natural language conversation. Ask questions, get statistics, generate visualizations — all through chat.

Built with a **FastAPI** backend using **Claude (Anthropic)** as the reasoning engine and a **React + TypeScript** frontend with real-time streaming.

---

## Features

- **Natural language data analysis** — ask questions in plain English (or Ukrainian), get instant answers with tables, statistics, and insights
- **Interactive visualizations** — bar, line, scatter, histogram, pie, box, and heatmap charts rendered with Recharts
- **File support** — CSV and Parquet uploads with automatic type detection
- **Agentic architecture** — Planner agent autonomously decides what queries to run, what charts to create, and how to present findings
- **Streaming responses** — Server-Sent Events for real-time message delivery with live status updates
- **Data transformations** — clean data, add columns, filter rows — changes persist in session
- **Chart export** — save any visualization as PNG or copy the Python code behind it
- **Data export** — export current (transformed) or original data as CSV
- **Sandboxed execution** — pandas queries run in a restricted `exec()` environment with no file/network access
- **Session management** — each upload creates an isolated session with its own data and conversation history
- **Smart suggestions** — after upload, get AI-generated prompt suggestions based on your data's columns and types
- **LaTeX math rendering** — statistical formulas and equations rendered with KaTeX
- **Markdown tables** — query results displayed as formatted, scrollable tables

---

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                   React Frontend                     │
│  App.tsx ← SSE stream ← /api/chat                   │
│  DataTab  │  PlotsTab  │  Chat panel                 │
└────────────────────┬────────────────────────────────┘
                     │ HTTP + SSE
┌────────────────────▼────────────────────────────────┐
│                  FastAPI Backend                      │
│                                                      │
│  routes.py ──► Planner Agent (agentic loop)          │
│                    │                                 │
│          ┌────────┼────────┬──────────┐              │
│          ▼        ▼        ▼          ▼              │
│    write_to_chat  query   create_plot  finish         │
│                  maker                                │
│                    │                                 │
│            QueryExecutor (sandboxed pandas)           │
│                    │                                 │
│             SessionManager (disk persistence)        │
└──────────────────────────────────────────────────────┘
```

### Backend

| Component | File | Description |
|-----------|------|-------------|
| **Planner Agent** | `agents/planner.py` | Agentic loop — calls Claude with tools, executes tool results, streams events to frontend |
| **Query Maker** | `agents/query_maker.py` | Generates pandas code from natural language intent |
| **Prompt Polisher** | `agents/prompt_polisher.py` | Refines user prompts before sending to LLM |
| **Query Executor** | `services/query_executor.py` | Sandboxed `exec()` for pandas operations with safety checks |
| **Session Manager** | `services/session_manager.py` | Manages per-session data files, chat history, and plot metadata |
| **Metrics Evaluator** | `services/metrics_evaluator.py` | Evaluates query result quality (hallucination checks, FAIL detection) |
| **Anthropic LLM** | `llm/anthropic_llm.py` | Claude API wrapper with tool-use support |
| **Mock LLM** | `llm/mock_llm.py` | Testing without API key — returns canned responses |
| **API Routes** | `api/routes.py` | All FastAPI endpoints — upload, chat (SSE), preview, plots, etc. |
| **Config** | `config.py` | Pydantic settings — API key, model, port, CORS |

### Frontend

| Component | File | Description |
|-----------|------|-------------|
| **App** | `src/App.tsx` | Main app — chat panel, SSE handling, file upload, state management |
| **DataTab** | `src/components/DataTab.tsx` | Left panel data table with sort, filter, search, version switching, CSV export |
| **PlotsTab** | `src/components/PlotsTab.tsx` | Plot gallery with view, code copy, and PNG download |
| **Chart** | `src/components/Chart.tsx` | Recharts wrapper supporting all chart types with customization |
| **MarkdownLatex** | `src/components/MarkdownLatex.tsx` | Markdown + LaTeX renderer for chat messages |

---

## Tech Stack

**Backend:**
- Python 3.11+
- FastAPI + Uvicorn
- Anthropic Claude API (claude-haiku-4-5 by default)
- Pandas for data manipulation
- Pydantic v2 for validation

**Frontend:**
- React 18 + TypeScript
- Vite 6
- Recharts for charts
- Tailwind CSS for styling
- KaTeX for math rendering
- Lucide React for icons
- html2canvas for PNG export

---

## Quick Start

### 1. Backend

```bash
cd backend

# Create virtual environment
python -m venv venv
venv\Scripts\activate        # Windows
# source venv/bin/activate   # Mac/Linux

# Install dependencies
pip install -r requirements.txt
```

### 2. Configure API Key

Create a `.env` file in the **root** directory:

```env
ANTHROPIC_API_KEY=your-api-key-here
```

Optional settings:

```env
CLASSIFIER_MODEL=claude-haiku-4-5-20251001   # LLM model to use
USE_MOCK_LLM=true                             # Test without API key
DEBUG=true                                    # Enable debug mode
```

### 3. Run Backend

```bash
# From root directory
python -m backend.main
```

Backend runs at **http://localhost:8001**

### 4. Run Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at **http://localhost:5173**

---

## Project Structure

```
agent-forge/
├── backend/
│   ├── agents/
│   │   ├── planner.py            # Main agentic loop with tool execution
│   │   ├── query_maker.py        # Natural language → pandas code
│   │   └── prompt_polisher.py    # Prompt refinement
│   ├── api/
│   │   └── routes.py             # All API endpoints
│   ├── llm/
│   │   ├── base.py               # Abstract LLM interface
│   │   ├── anthropic_llm.py      # Claude API implementation
│   │   └── mock_llm.py           # Mock for testing
│   ├── models/
│   │   └── planner_models.py     # Pydantic schemas (ToolCall, ChatEvent, PlotInfo, etc.)
│   ├── prompts/
│   │   └── planner_system.txt    # System prompt for the Planner agent
│   ├── services/
│   │   ├── session_manager.py    # Session data persistence
│   │   ├── query_executor.py     # Sandboxed pandas execution
│   │   └── metrics_evaluator.py  # Result quality evaluation
│   ├── config.py                 # App settings (Pydantic)
│   ├── main.py                   # Uvicorn entry point
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── App.tsx               # Main application
│   │   ├── main.tsx              # React entry point
│   │   ├── index.css             # Global styles + animations
│   │   └── components/
│   │       ├── Chart.tsx         # Recharts chart wrapper
│   │       ├── DataTab.tsx       # Data table panel
│   │       ├── PlotsTab.tsx      # Plot gallery panel
│   │       └── MarkdownLatex.tsx # Markdown + LaTeX renderer
│   ├── package.json
│   └── vite.config.ts
│
├── .env                          # API keys (create this)
├── .env.example                  # Template
└── README.md
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/api/session` | Create a new session |
| `GET` | `/api/session/{session_id}` | Get session status |
| `POST` | `/api/upload/{session_id}` | Upload CSV/Parquet file |
| `GET` | `/api/summary/{session_id}` | Get data summary |
| `GET` | `/api/suggestions/{session_id}` | Get AI prompt suggestions |
| `GET` | `/api/preview/{session_id}` | Get data preview (paginated) |
| `POST` | `/api/chat` | Main chat endpoint (SSE streaming) |
| `POST` | `/api/chat/{session_id}/message` | Add message to history |
| `GET` | `/api/chat/{session_id}/history` | Get chat history |
| `GET` | `/api/plots/{session_id}` | Get all generated plots |
| `POST` | `/api/reset/{session_id}` | Reset data to original |
| `GET` | `/api/health` | Health check |

---

## How It Works

1. **Upload** — user uploads a CSV or Parquet file, creating a new session
2. **Chat** — user types a question in natural language
3. **Planner Agent** receives the message along with a data summary and available tools
4. **Tool loop** — the agent decides which tools to call:
   - `write_to_chat(text)` — sends a message to the user (streamed via SSE)
   - `generate_query(intent)` — generates and executes pandas code against the dataset
   - `create_plot(...)` — creates a chart configuration sent to the frontend for rendering
   - `finish()` — ends the current turn
5. **Streaming** — all events are streamed to the frontend via SSE as they happen
6. **Data mutations** — if a query modifies the DataFrame (new columns, filtered rows, etc.), the updated data is persisted and the frontend refreshes

---

## Security

- **Sandboxed execution** — pandas queries run via `exec()` with restricted `__builtins__` (no `open`, `import`, `eval`, `exec`, `os`, `sys`, `subprocess`)
- **Session isolation** — each session has its own data directory under `data/sessions/`
- **No file system access** — generated code cannot read or write files outside the sandbox
- **Input validation** — Pydantic models validate all API inputs
