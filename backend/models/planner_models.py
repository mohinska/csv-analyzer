from pydantic import BaseModel
from typing import Any, Optional
from enum import Enum


class ToolName(str, Enum):
    WRITE_TO_CHAT = "write_to_chat"
    GENERATE_QUERY = "generate_query"
    CREATE_PLOT = "create_plot"
    FINISH = "finish"


class ToolCall(BaseModel):
    """Represents a tool call from the LLM."""
    id: str
    name: str
    input: dict[str, Any]


class ToolResult(BaseModel):
    """Result of executing a tool."""
    tool_use_id: str
    content: str
    is_error: bool = False


class ChatEvent(BaseModel):
    """Event sent to frontend via SSE."""
    event_type: str  # "text", "query_result", "plot", "error", "done", "status"
    data: dict[str, Any]


class PlotConfig(BaseModel):
    """Configuration for creating a plot."""
    plot_type: str
    title: str
    x_column: Optional[str] = None
    y_column: Optional[str] = None
    color_column: Optional[str] = None
    aggregation: Optional[str] = None


class ChartConfig(BaseModel):
    """Configuration for rendering a chart on frontend."""
    chart_type: str  # bar, line, area, pie, scatter, histogram
    x_key: str
    y_key: str
    color_key: Optional[str] = None
    series: Optional[list[str]] = None  # Series names for multi-series (grouped) charts


class PlotInfo(BaseModel):
    """Information about a created plot."""
    id: str
    title: str
    columns_used: str
    summary: Optional[str] = None
    chart_config: Optional[ChartConfig] = None
    chart_data: Optional[list[dict]] = None
    code_snippet: Optional[str] = None


class AnswerType(str, Enum):
    """Expected answer format, classified during prompt preprocessing."""
    TEXT = "text"
    CSV = "csv"       # Data transformation → returns modified DataFrame
    SVG = "svg"       # Visualization → returns chart


class PlannerState(BaseModel):
    """Explicit state object for a planner run."""
    # Input
    user_message: str
    data_summary: str = ""

    # Preprocessing
    prompt_type: Optional[str] = None
    answer_type: AnswerType = AnswerType.TEXT
    polished_prompt: Optional[str] = None

    # Execution
    query: Optional[str] = None
    data_ver: int = 0
    last_query_result: Optional[str] = None

    # Results
    chat_messages: list[str] = []
    plots: list[dict] = []
    query_results: list[str] = []

    # Control
    finished: bool = False
    data_updated: bool = False
    iteration: int = 0

    # Metrics
    run_metrics: list[dict] = []
    judge_verdicts: list[dict] = []

    class Config:
        arbitrary_types_allowed = True


class ChatRequest(BaseModel):
    """Request body for chat endpoint."""
    session_id: str
    message: str
    stream: bool = True
    internal: bool = False  # If true, don't save full message to visible history


class ChatResponse(BaseModel):
    """Response for non-streaming chat."""
    messages: list[str]
    plots: list[dict]  # list of PlotInfo.model_dump()
    data_updated: bool = False
