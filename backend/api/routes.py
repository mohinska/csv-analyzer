import json
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from backend.models.schemas import (
    UploadResponse,
    SessionStatusResponse,
)
from backend.models.planner_models import ChatRequest, ChatResponse
from backend.agents.query_maker import QueryMaker
from backend.agents.planner import PlannerAgent, safe_print
from backend.llm.anthropic_llm import AnthropicLLM
from backend.llm.mock_llm import MockLLM
from backend.config import get_settings, Settings
from backend.services.session_manager import get_session_manager, SessionManager, _safe_json_dumps, _sanitize_preview
from backend.services.query_executor import get_query_executor, QueryExecutor
from backend.services.llm_judge import LLMJudge
from backend.agents.prompt_polisher import PromptPolisher
import pandas as pd
import re

router = APIRouter()


def _pandas_to_sql_type(dtype: str) -> str:
    """Map pandas dtype to approximate SQL type."""
    dtype = str(dtype).lower()
    if 'int' in dtype:
        return 'INTEGER'
    elif 'float' in dtype:
        return 'DOUBLE'
    elif 'bool' in dtype:
        return 'BOOLEAN'
    elif 'datetime' in dtype:
        return 'TIMESTAMP'
    else:
        return 'VARCHAR'


def _summarize_for_query(df: pd.DataFrame) -> str:
    """Generate a minimal summary optimized for SQL query generation."""
    lines = []
    lines.append("Table: df")
    lines.append(f"Rows: {len(df)}")
    lines.append("")
    lines.append("Columns:")

    for col in df.columns:
        dtype = str(df[col].dtype)
        sql_type = _pandas_to_sql_type(dtype)
        if pd.api.types.is_numeric_dtype(df[col]):
            min_val = df[col].min()
            max_val = df[col].max()
            lines.append(f"  - {col} ({sql_type}): range [{min_val} to {max_val}]")
        elif df[col].nunique() <= 10:
            categories = df[col].dropna().unique().tolist()[:10]
            lines.append(f"  - {col} ({sql_type}): values {categories}")
        else:
            sample = str(df[col].dropna().iloc[0])[:30] if len(df[col].dropna()) > 0 else "N/A"
            lines.append(f"  - {col} ({sql_type}): e.g. \"{sample}\"")

    return "\n".join(lines)


def _summarize_basic(df: pd.DataFrame, filename: str) -> str:
    """Generate a basic markdown summary."""
    lines = []
    lines.append(f"# Data Summary: {filename}")
    lines.append("")
    lines.append("## Overview")
    lines.append(f"- **Rows:** {len(df):,}")
    lines.append(f"- **Columns:** {len(df.columns)}")
    lines.append("")
    lines.append("## Schema")
    lines.append("| Column | Type | Non-Null | Unique |")
    lines.append("|--------|------|----------|--------|")

    for col in df.columns:
        dtype = str(df[col].dtype)
        non_null = df[col].notna().sum()
        unique = df[col].nunique()
        lines.append(f"| {col} | {dtype} | {non_null:,} | {unique:,} |")

    lines.append("")
    lines.append("## Sample Data (first 5 rows)")
    lines.append(df.head(5).to_markdown(index=False))

    return "\n".join(lines)


def get_llm(settings: Settings = Depends(get_settings)):
    """Get LLM instance based on settings."""
    if settings.should_use_mock:
        return MockLLM()
    return AnthropicLLM(
        model=settings.classifier_model,
        api_key=settings.anthropic_api_key,
    )


# ============ Session Endpoints ============

@router.post("/session")
async def create_session(
    session_mgr: SessionManager = Depends(get_session_manager),
):
    """Create a new session."""
    session_id = session_mgr.create_session()
    return {"session_id": session_id}


@router.get("/session/{session_id}", response_model=SessionStatusResponse)
async def get_session_status(
    session_id: str,
    session_mgr: SessionManager = Depends(get_session_manager),
):
    """Check if session has an uploaded file."""
    session = session_mgr.get_session(session_id)
    if not session:
        return SessionStatusResponse(has_file=False, session=None)
    return SessionStatusResponse(has_file=session.has_file, session=session)


# ============ Upload Endpoint ============

@router.post("/upload/{session_id}", response_model=UploadResponse)
async def upload_file(
    session_id: str,
    file: UploadFile = File(...),
    session_mgr: SessionManager = Depends(get_session_manager),
):
    """Upload a CSV or Parquet file to start analysis."""
    # Validate file type
    allowed_extensions = (".csv", ".parquet", ".pq")
    if not any(file.filename.lower().endswith(ext) for ext in allowed_extensions):
        raise HTTPException(status_code=400, detail="Only CSV and Parquet files are supported")

    # Read file content
    content = await file.read()

    try:
        # Save and parse file
        metadata = session_mgr.save_file(session_id, file.filename, content)

        return UploadResponse(
            session_id=session_id,
            filename=file.filename,
            row_count=metadata["row_count"],
            column_count=metadata["column_count"],
            columns=metadata["columns"],
            preview=metadata["preview"],
            message=f"Successfully loaded {file.filename} with {metadata['row_count']} rows and {metadata['column_count']} columns",
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to parse file: {str(e)}")


# ============ Data Summary Endpoint ============

@router.get("/summary/{session_id}")
async def get_data_summary(
    session_id: str,
    mode: str = "basic",  # basic, query, enhanced
    session_mgr: SessionManager = Depends(get_session_manager),
    llm=Depends(get_llm),
):
    """Get a text summary of the uploaded data for LLM context."""
    df = session_mgr.get_dataframe(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail="No data found for this session")

    session = session_mgr.get_session(session_id)
    filename = session.filename if session else "data.csv"

    if mode == "query":
        summary = _summarize_for_query(df)
    else:
        summary = _summarize_basic(df, filename)

    return {"summary": summary, "mode": mode}


# ============ Suggestions Endpoint ============

def _generate_suggestions(df: pd.DataFrame) -> list[dict]:
    """Generate heuristic prompt suggestions based on DataFrame schema."""
    suggestions = []

    numeric_cols = df.select_dtypes(include=["number"]).columns.tolist()
    categorical_cols = [
        c for c in df.select_dtypes(exclude=["number"]).columns
        if df[c].nunique() <= 20
    ]

    # Check if data needs cleaning
    has_missing = df.isnull().any().any()
    has_duplicates = df.duplicated().any()

    # Check data type issues
    type_issues = []
    for c in df.columns:
        if df[c].dtype == 'object':
            # Check if looks numeric
            non_null = df[c].dropna()
            if len(non_null) > 0:
                try:
                    pd.to_numeric(non_null.head(20))
                    type_issues.append(c)
                except (ValueError, TypeError):
                    pass

    if has_missing or has_duplicates or type_issues:
        parts = []
        if has_missing:
            missing_count = df.isnull().sum().sum()
            parts.append(f"{missing_count} missing values")
        if has_duplicates:
            dup_count = df.duplicated().sum()
            parts.append(f"{dup_count} duplicate rows")
        if type_issues:
            parts.append(f"{len(type_issues)} columns with type issues")
        suggestions.append({
            "text": f"Clean the data (fix {', '.join(parts)})",
            "category": "cleaning",
        })

    if numeric_cols:
        suggestions.append({
            "text": f"What are the key statistics for {numeric_cols[0]}?",
            "category": "analysis",
        })

    if categorical_cols and numeric_cols:
        suggestions.append({
            "text": f"Show a bar chart of {numeric_cols[0]} by {categorical_cols[0]}",
            "category": "visualization",
        })

    if len(numeric_cols) > 1:
        suggestions.append({
            "text": f"Show the distribution of {numeric_cols[-1]}",
            "category": "visualization",
        })

    if not has_missing and not has_duplicates:
        suggestions.append({
            "text": "Are there any missing values in the data?",
            "category": "analysis",
        })

    return suggestions[:4]


@router.get("/suggestions/{session_id}")
async def get_suggestions(
    session_id: str,
    session_mgr: SessionManager = Depends(get_session_manager),
):
    """Generate smart prompt suggestions based on the uploaded data."""
    df = session_mgr.get_dataframe(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail="No data found for this session")

    session = session_mgr.get_session(session_id)
    filename = session.filename if session else "data.csv"

    suggestions = _generate_suggestions(df)
    return {
        "filename": filename,
        "suggestions": suggestions,
    }


# ============ Query Endpoint ============

class QueryRequest(BaseModel):
    session_id: str
    query: str
    execute: bool = True  # If False, only generate code without executing


@router.post("/query")
async def generate_and_execute_query(
    request: QueryRequest,
    session_mgr: SessionManager = Depends(get_session_manager),
    executor: QueryExecutor = Depends(get_query_executor),
    llm=Depends(get_llm),
):
    """Generate pandas code from natural language and optionally execute it."""
    df = session_mgr.get_dataframe(request.session_id)
    if df is None:
        raise HTTPException(status_code=404, detail="No data found for this session")

    # Get data summary for query generation
    data_summary = _summarize_for_query(df)

    # Generate query
    query_maker = QueryMaker(llm)
    try:
        generated = await query_maker.generate_query(request.query, data_summary)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    response = {
        "code": generated.code,
        "explanation": generated.explanation,
        "is_aggregation": generated.is_aggregation,
        "is_transformation": generated.is_transformation,
    }

    # Execute if requested
    if request.execute:
        result = executor.execute(generated.code, df)
        response["execution"] = {
            "success": result.success,
            "result_type": result.result_type,
            "result_preview": result.result_preview,
            "error": result.error,
        }

        # If transformation was successful, save the new DataFrame
        if result.success and generated.is_transformation and result.result_type == "dataframe":
            session_mgr.save_transformed_dataframe(request.session_id, result.result)
            response["execution"]["data_updated"] = True

    return response


# ============ Data Preview Endpoint ============

@router.get("/preview/{session_id}")
async def get_data_preview(
    session_id: str,
    rows: int = 100,
    version: str = "current",  # "current" or "original"
    session_mgr: SessionManager = Depends(get_session_manager),
):
    """Get data preview. Use version='original' for initial data, 'current' for transformed."""
    use_current = version != "original"
    df = session_mgr.get_dataframe(session_id, use_current=use_current)
    if df is None:
        raise HTTPException(status_code=404, detail="No data found for this session")

    session = session_mgr.get_session(session_id)

    return {
        "filename": session.filename if session else "data.csv",
        "row_count": len(df),
        "column_count": len(df.columns),
        "columns": df.columns.tolist(),
        "preview": _sanitize_preview(df, rows),
        "version": version,
    }


@router.post("/reset/{session_id}")
async def reset_to_original(
    session_id: str,
    session_mgr: SessionManager = Depends(get_session_manager),
):
    """Reset data to original uploaded file."""
    try:
        metadata = session_mgr.reset_to_original(session_id)
        return {
            "message": "Data reset to original",
            "row_count": metadata["row_count"],
            "column_count": metadata["column_count"],
            "columns": metadata["columns"],
            "preview": metadata["preview"],
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


# ============ Chat History & Plots Endpoints ============

class AddMessageRequest(BaseModel):
    role: str
    text: str
    message_type: str = "text"


@router.post("/chat/{session_id}/message")
async def add_chat_message(
    session_id: str,
    request: AddMessageRequest,
    session_mgr: SessionManager = Depends(get_session_manager),
):
    """Add a message to chat history."""
    session = session_mgr.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    message = session_mgr.add_chat_message(
        session_id, request.role, request.text, request.message_type
    )
    return {"message": message}


@router.get("/chat/{session_id}/history")
async def get_chat_history(
    session_id: str,
    session_mgr: SessionManager = Depends(get_session_manager),
):
    """Get chat history for a session."""
    session = session_mgr.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    history = session_mgr.get_chat_history(session_id)
    return {"messages": history}


@router.get("/plots/{session_id}")
async def get_plots(
    session_id: str,
    session_mgr: SessionManager = Depends(get_session_manager),
):
    """Get all plots for a session."""
    session = session_mgr.get_session(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    plots = session_mgr.get_plots(session_id)
    return {"plots": plots}


@router.get("/plot-image/{path:path}")
async def get_plot_image(path: str):
    """Serve plot image files (SVG/PNG)."""
    import os
    from fastapi.responses import FileResponse

    # Security: only allow files from data/plots directory
    if ".." in path:
        raise HTTPException(status_code=400, detail="Invalid path")

    # The path should already be relative to project root
    full_path = path
    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="Plot image not found")

    # Determine content type
    if path.endswith('.svg'):
        media_type = "image/svg+xml"
    elif path.endswith('.png'):
        media_type = "image/png"
    else:
        media_type = "application/octet-stream"

    return FileResponse(full_path, media_type=media_type)


# ============ Chat Endpoint (Planner Agent) ============

@router.post("/chat")
async def chat(
    request: ChatRequest,
    session_mgr: SessionManager = Depends(get_session_manager),
    executor: QueryExecutor = Depends(get_query_executor),
    llm=Depends(get_llm),
):
    """
    Main chat endpoint using the Planner Agent.
    Supports streaming via Server-Sent Events.
    """
    # Get session data
    df = session_mgr.get_dataframe(request.session_id)
    if df is None:
        raise HTTPException(status_code=404, detail="No data found. Please upload a file first.")

    session = session_mgr.get_session(request.session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    # Save user message to history (skip internal auto-analysis prompts)
    if not request.internal:
        session_mgr.add_chat_message(request.session_id, "user", request.message)

    # Initialize components
    query_maker = QueryMaker(llm)

    # Initialize LLM judge if enabled (skip for internal auto-analysis)
    settings = get_settings()
    judge = None
    if settings.judge_enabled and not settings.should_use_mock and not request.internal:
        judge_llm = AnthropicLLM(
            model=settings.judge_model,
            api_key=settings.anthropic_api_key,
        )
        judge = LLMJudge(judge_llm)

    # Initialize prompt polisher (skip for internal auto-analysis)
    polisher = PromptPolisher(llm) if not settings.should_use_mock and not request.internal else None

    # Create planner with all dependencies
    planner = PlannerAgent(
        llm=llm,
        query_maker=query_maker,
        query_executor=executor,
        judge=judge,
        prompt_polisher=polisher,
    )

    # Parse message cap from internal instructions (e.g. "Send these three as separate messages")
    max_messages = 0
    if request.internal:
        word_to_num = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6}
        m = re.search(r'(?:send|exactly)\s+(?:these\s+)?(\w+)\s+(?:as\s+)?(?:separate\s+)?messages', request.message, re.IGNORECASE)
        if m:
            val = m.group(1)
            max_messages = word_to_num.get(val.lower(), 0) or int(val) if val.isdigit() else 0

    safe_print(f"[Routes] /chat called: session={request.session_id}, message='{request.message[:50]}...', max_messages={max_messages}")

    if request.stream:
        # SSE streaming response
        async def event_generator():
            safe_print(f"[Routes] SSE generator started")
            new_df = None
            data_updated = False

            try:
                async for event in planner.run(
                    user_message=request.message,
                    df=df,
                    filename=session.filename,
                    session_id=request.session_id,
                    session_mgr=session_mgr,
                    max_messages=max_messages,
                ):
                    safe_print(f"[Routes] Got event: {event.event_type}")
                    # Check for data updates in done event
                    if event.event_type == "done":
                        data_updated = event.data.get("data_updated", False)
                        new_df = event.data.get("new_df")
                        # Don't include new_df in the SSE event
                        event_data = {k: v for k, v in event.data.items() if k != "new_df"}
                        yield f"event: {event.event_type}\ndata: {_safe_json_dumps(event_data)}\n\n"
                    else:
                        yield f"event: {event.event_type}\ndata: {_safe_json_dumps(event.data)}\n\n"
            except Exception as e:
                import traceback
                safe_print(f"[Routes] SSE generator error: {e}")
                traceback.print_exc()
                yield f"event: error\ndata: {_safe_json_dumps({'message': str(e)})}\n\n"

            # Save updated DataFrame if changed
            if data_updated and new_df is not None:
                session_mgr.save_transformed_dataframe(request.session_id, new_df)

        return StreamingResponse(
            event_generator(),
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no",
            }
        )
    else:
        # Non-streaming: collect all events
        events = []
        new_df = None
        data_updated = False
        chat_messages = []
        plots = []

        async for event in planner.run(
            user_message=request.message,
            df=df,
            filename=session.filename,
            session_id=request.session_id,
            session_mgr=session_mgr,
            max_messages=max_messages,
        ):
            events.append(event.model_dump())

            if event.event_type == "text":
                chat_messages.append(event.data.get("text", ""))
            elif event.event_type == "plot":
                plots.append(event.data)
            elif event.event_type == "done":
                data_updated = event.data.get("data_updated", False)
                new_df = event.data.get("new_df")

        # Save updated DataFrame if changed
        if data_updated and new_df is not None:
            session_mgr.save_transformed_dataframe(request.session_id, new_df)

        return ChatResponse(
            messages=chat_messages,
            plots=plots,
            data_updated=data_updated,
        )


# ============ Health Check ============

@router.get("/health")
async def health_check(settings: Settings = Depends(get_settings)):
    """Health check endpoint."""
    return {
        "status": "ok",
        "using_mock_llm": settings.should_use_mock,
    }


# ============ Debug: Test Matplotlib ============

@router.get("/debug/test-matplotlib/{session_id}")
async def test_matplotlib(
    session_id: str,
    session_mgr: SessionManager = Depends(get_session_manager),
):
    """Debug endpoint to test matplotlib plot creation."""
    import os
    import uuid
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt

    df = session_mgr.get_dataframe(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail="No data found for this session")

    results = {"steps": []}

    try:
        # Step 1: Create figure
        results["steps"].append("Creating figure...")
        fig, ax = plt.subplots(figsize=(10, 6))
        results["steps"].append(f"Figure created: {type(fig)}")

        # Step 2: Get first numeric column
        numeric_cols = df.select_dtypes(include=['number']).columns
        if len(numeric_cols) == 0:
            results["steps"].append("No numeric columns found, using index")
            ax.plot(range(min(20, len(df))), range(min(20, len(df))))
            ax.set_title("Test Plot (no numeric data)")
        else:
            col = numeric_cols[0]
            results["steps"].append(f"Using column: {col}")
            data = df[col].head(20).values
            ax.bar(range(len(data)), data)
            ax.set_title(f"Test: {col}")

        results["steps"].append("Plot configured")

        # Step 3: Save figure
        plot_dir = f"data/plots/{session_id}"
        os.makedirs(plot_dir, exist_ok=True)
        plot_id = str(uuid.uuid4())[:8]
        plot_path = f"{plot_dir}/{plot_id}.svg"

        results["steps"].append(f"Saving to: {plot_path}")
        fig.savefig(plot_path, format='svg', bbox_inches='tight')
        results["steps"].append("Figure saved!")

        plt.close(fig)
        results["steps"].append("Figure closed")

        # Step 4: Verify file exists
        if os.path.exists(plot_path):
            file_size = os.path.getsize(plot_path)
            results["steps"].append(f"File exists, size: {file_size} bytes")
            results["success"] = True
            results["plot_path"] = plot_path
            results["plot_url"] = f"/api/plot-image/{plot_path}"
        else:
            results["steps"].append("ERROR: File was not created!")
            results["success"] = False

    except Exception as e:
        import traceback
        results["steps"].append(f"ERROR: {type(e).__name__}: {str(e)}")
        results["traceback"] = traceback.format_exc()
        results["success"] = False

    return results


@router.get("/debug/test-generated-plot/{session_id}")
async def test_generated_plot(
    session_id: str,
    session_mgr: SessionManager = Depends(get_session_manager),
    executor: QueryExecutor = Depends(get_query_executor),
    llm=Depends(get_llm),
):
    """Debug endpoint to test the full plot generation pipeline."""
    import os
    import uuid
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt

    df = session_mgr.get_dataframe(session_id)
    if df is None:
        raise HTTPException(status_code=404, detail="No data found for this session")

    results = {"steps": []}

    try:
        # Step 1: Generate plot code via QueryMaker
        results["steps"].append("Generating plot code via QueryMaker...")
        data_summary = _summarize_for_query(df)
        results["data_summary"] = data_summary[:500]

        query_maker = QueryMaker(llm)
        generated = await query_maker.generate_plot_code(
            plot_type="bar",
            data_summary=data_summary,
            title="Test Generated Plot",
            x_column=df.columns[0] if len(df.columns) > 0 else None,
            y_column=df.select_dtypes(include=['number']).columns[0] if len(df.select_dtypes(include=['number']).columns) > 0 else None,
        )
        results["steps"].append("Code generated!")
        results["generated_code"] = generated.code
        results["generated_title"] = generated.title

        # Step 2: Execute the generated code
        results["steps"].append("Executing generated code...")
        result = executor.execute(generated.code, df)
        results["steps"].append(f"Execution result: success={result.success}, type={result.result_type}")

        if not result.success:
            results["steps"].append(f"ERROR: {result.error}")
            results["success"] = False
            results["error"] = result.error
            return results

        if result.result_type != "figure":
            results["steps"].append(f"ERROR: Expected 'figure' but got '{result.result_type}'")
            results["success"] = False
            return results

        # Step 3: Save figure
        plot_dir = f"data/plots/{session_id}"
        os.makedirs(plot_dir, exist_ok=True)
        plot_id = str(uuid.uuid4())[:8]
        plot_path = f"{plot_dir}/{plot_id}.svg"

        results["steps"].append(f"Saving figure to: {plot_path}")
        result.result.savefig(plot_path, format='svg', bbox_inches='tight')
        plt.close(result.result)
        results["steps"].append("Figure saved and closed!")

        if os.path.exists(plot_path):
            file_size = os.path.getsize(plot_path)
            results["steps"].append(f"File exists, size: {file_size} bytes")
            results["success"] = True
            results["plot_path"] = plot_path
            results["plot_url"] = f"/api/plot-image/{plot_path}"
        else:
            results["steps"].append("ERROR: File was not created!")
            results["success"] = False

    except Exception as e:
        import traceback
        results["steps"].append(f"ERROR: {type(e).__name__}: {str(e)}")
        results["traceback"] = traceback.format_exc()
        results["success"] = False

    return results
