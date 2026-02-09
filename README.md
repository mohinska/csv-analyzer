# Agent Forge — AI Data Analyzer

An AI-powered data analysis assistant that lets you upload CSV/Parquet files and explore them through natural language conversation. Ask questions, get statistics, generate visualizations — all through chat.

Built with a **FastAPI** backend using **Claude (Anthropic)** as the reasoning engine and a **React + TypeScript** frontend with real-time streaming.

---

## Features

- **Natural language data analysis** — ask questions in plain English (or Ukrainian), get instant answers with tables, statistics, and insights
- **Interactive visualizations** — bar, line, scatter, histogram, pie, box, heatmap, and area charts rendered with Recharts, with multi-series (grouped) support
- **File support** — CSV and Parquet uploads with automatic type detection
- **Agentic architecture** — Planner agent autonomously decides what queries to run, what charts to create, and how to present findings
- **Streaming responses** — Server-Sent Events for real-time message delivery with live status updates
- **Data transformations** — clean data, add columns, filter rows — changes persist in session
- **Chart customization** — change colors, backgrounds; export any chart as PNG or copy the Python code behind it
- **Data export** — export current (transformed) or original data as CSV
- **DuckDB SQL engine** — fast analytical queries with full SQL support (window functions, CTEs, statistical aggregates)
- **LLM Judge** — per-message quality evaluation for relevance, accuracy, and completeness
- **Session management** — each upload creates an isolated session with its own data and conversation history
- **Smart suggestions** — after upload, get AI-generated prompt suggestions based on your data
- **LaTeX math rendering** — statistical formulas and equations rendered with KaTeX
- **Markdown tables** — query results displayed as formatted, scrollable tables

---

## Quick Start

### Prerequisites

- Python 3.11+
- Node.js 18+
- An [Anthropic API key](https://console.anthropic.com/)

### 1. Clone and configure

```bash
git clone <repo-url>
cd csv-analyzer

# Create .env in the root directory
echo "ANTHROPIC_API_KEY=your-api-key-here" > .env
```

### 2. Backend

```bash
# Create virtual environment
python3 -m venv venv
source venv/bin/activate      # Mac/Linux
# venv\Scripts\activate       # Windows

# Install dependencies
pip install -r backend/requirements.txt

# Run (from root directory, not from backend/)
python3 -m backend.main
```

Backend runs at **http://localhost:8001**

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend runs at **http://localhost:3000**

Open http://localhost:3000, upload a CSV or Parquet file, and start chatting.

---

## Architecture

```
+---------------------------------------------------------+
|                   React Frontend (:3000)                 |
|  App.tsx <- SSE stream <- /api/chat                      |
|  DataTab  |  PlotsTab  |  Chat panel                     |
+----------------------------+----------------------------+
                             | HTTP + SSE (proxied via Vite)
+----------------------------v----------------------------+
|                  FastAPI Backend (:8001)                  |
|                                                          |
|  routes.py --> PromptPolisher --> Planner Agent (loop)    |
|                                      |                   |
|              +----------+------------+--------+          |
|              v          v            v        v          |
|        write_to_chat  generate    create    finish        |
|                       _query      _plot                   |
|                         |                                |
|                    QueryMaker (LLM -> DuckDB SQL)        |
|                         |                                |
|                  QueryExecutor (DuckDB)                   |
|                         |                                |
|                    LLM Judge (quality eval)               |
|                         |                                |
|                  SessionManager (disk)                    |
+----------------------------------------------------------+
```

### Backend Components

| Component | File | Description |
|-----------|------|-------------|
| **Planner Agent** | `agents/planner.py` | Agentic loop — calls Claude with tools, executes results, prepares chart data, streams events |
| **Query Maker** | `agents/query_maker.py` | Generates DuckDB SQL from natural language intent |
| **Prompt Polisher** | `agents/prompt_polisher.py` | Validates and classifies user prompts before the planner |
| **Query Executor** | `services/query_executor.py` | Executes DuckDB SQL against the session DataFrame |
| **LLM Judge** | `services/llm_judge.py` | Evaluates response quality (relevance, accuracy, completeness) |
| **Metrics Evaluator** | `services/metrics_evaluator.py` | Checks query results for quality issues and hallucinations |
| **Session Manager** | `services/session_manager.py` | Per-session data files, chat history, and plot metadata |
| **Anthropic LLM** | `llm/anthropic_llm.py` | Claude API wrapper with tool-use support |
| **Mock LLM** | `llm/mock_llm.py` | Testing without API key — returns canned responses |
| **API Routes** | `api/routes.py` | All FastAPI endpoints — upload, chat (SSE), preview, plots, etc. |
| **Config** | `config.py` | Pydantic settings — API key, model, port, CORS |

### Frontend Components

| Component | File | Description |
|-----------|------|-------------|
| **App** | `src/App.tsx` | Main app — chat panel, SSE handling, file upload, state management |
| **DataTab** | `src/components/DataTab.tsx` | Left panel data table with sort, filter, search, version switching, CSV export |
| **PlotsTab** | `src/components/PlotsTab.tsx` | Plot gallery with view, code copy, and PNG download |
| **Chart** | `src/components/Chart.tsx` | Recharts wrapper — bar, line, area, scatter, histogram, pie, box, heatmap with multi-series support |
| **MarkdownLatex** | `src/components/MarkdownLatex.tsx` | Markdown + LaTeX renderer for chat messages |

---

## Tech Stack

**Backend:**
- Python 3.11+
- FastAPI + Uvicorn
- Anthropic Claude API (claude-sonnet-4-5 by default)
- DuckDB for analytical SQL queries
- Pandas for data loading and transformations
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

## Configuration

The `.env` file in the project root configures the backend:

```env
ANTHROPIC_API_KEY=your-api-key-here    # Required

# Optional
CLASSIFIER_MODEL=claude-sonnet-4-5-20250929   # LLM model for the planner
JUDGE_MODEL=claude-sonnet-4-5-20250929        # LLM model for quality evaluation
JUDGE_ENABLED=true                             # Enable/disable LLM Judge
USE_MOCK_LLM=false                             # Test without API key
DEBUG=true                                     # Enable debug logging
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
2. **Auto-analysis** — an initial analysis runs automatically, providing key stats and insights
3. **Chat** — user types a question in natural language
4. **Planner Agent** receives the message along with a data summary and available tools
5. **Tool loop** — the agent decides which tools to call:
   - `write_to_chat(text)` — sends a message to the user (streamed via SSE)
   - `generate_query(intent)` — generates and executes DuckDB SQL against the dataset
   - `create_plot(...)` — prepares chart data (aggregation, pivoting, sorting) sent to the frontend for Recharts rendering
   - `finish()` — ends the current turn
6. **Streaming** — all events are streamed to the frontend via SSE as they happen
7. **Data mutations** — if a query modifies the DataFrame, the updated data is persisted and the frontend refreshes

---

## Security

- **SQL sanitization** — generated DuckDB queries are validated; DDL/DML statements (DROP, DELETE, INSERT, etc.) are blocked
- **Plot code sanitization** — generated matplotlib code is stripped of imports, `exec()`, `eval()`, `open()`, and other dangerous patterns
- **Session isolation** — each session has its own data directory under `data/sessions/`
- **Input validation** — Pydantic models validate all API inputs
