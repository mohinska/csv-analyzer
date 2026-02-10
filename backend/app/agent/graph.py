"""Agent graph — the core planner loop using Anthropic tool-use API."""

import asyncio
import json
import logging
import time
from typing import Any, Callable, Awaitable

import anthropic
from sqlalchemy.orm import Session as DBSession

logger = logging.getLogger("agent")

from backend.app.agent.context import build_data_summary, get_system_prompt, build_messages_for_llm
from backend.app.agent.persistence import save_reasoning, save_tool_message
from backend.app.agent.tools import (
    create_duckdb_connection,
    execute_sql_query,
    execute_output_text,
    execute_output_table,
    execute_create_plot,
    execute_finalize,
    SendEvent,
)
from backend.app.config import settings

MAX_ITERATIONS = 15
MODEL = "claude-sonnet-4-5-20250929"

TOOL_DEFINITIONS = [
    {
        "name": "sql_query",
        "description": (
            "Execute a read-only SQL query against the dataset using DuckDB. "
            "The table is named `data`. Only SELECT statements allowed."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "DuckDB SQL query (SELECT only)"},
                "description": {"type": "string", "description": "Present-progressive status shown to user while running, e.g. 'Examining the first 10 rows...', 'Counting null values per column...'"},
            },
            "required": ["query", "description"],
        },
    },
    {
        "name": "output_text",
        "description": "Send a text message to the user. Use for explanations, insights, summaries.",
        "input_schema": {
            "type": "object",
            "properties": {
                "text": {"type": "string", "description": "Markdown-formatted text"},
            },
            "required": ["text"],
        },
    },
    {
        "name": "output_table",
        "description": "Display a structured table to the user. Use for presenting tabular results.",
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "Table title"},
                "headers": {"type": "array", "items": {"type": "string"}, "description": "Column headers"},
                "rows": {"type": "array", "items": {"type": "array"}, "description": "Row data (each row is an array of values)"},
            },
            "required": ["title", "headers", "rows"],
        },
    },
    {
        "name": "create_plot",
        "description": (
            "Create an interactive visualization using Plotly.js. "
            "The spec must be a JSON object with 'data' (array of trace objects) and optional 'layout'. "
            "Include data inline in each trace (x, y arrays for cartesian; values+labels for pie). "
            "Always aggregate data with sql_query first — keep data arrays under 100 elements. "
            "Use field names matching your query results. "
            "Chart types: bar (type:'bar'), line (type:'scatter', mode:'lines'), scatter (type:'scatter', mode:'markers'), "
            "histogram (type:'histogram'), box (type:'box'), pie (type:'pie' with labels+values), heatmap (type:'heatmap'). "
            "For heatmaps (including correlation matrices): provide z (2D array), x (column labels), y (row labels). "
            "The frontend auto-annotates heatmap cells with values and applies a purple colorscale. "
            "For horizontal bars set orientation:'h'. "
            "Do NOT set colors, fonts, paper_bgcolor, or plot_bgcolor — the frontend applies a consistent dark purple theme automatically. "
            "In layout, only set axis titles (xaxis.title, yaxis.title) and barmode if needed."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "Chart title"},
                "plotly_spec": {
                    "type": "object",
                    "description": "Plotly.js spec with 'data' (array of traces) and optional 'layout'",
                    "properties": {
                        "data": {
                            "type": "array",
                            "description": "Array of Plotly trace objects",
                        },
                        "layout": {
                            "type": "object",
                            "description": "Optional Plotly layout (axis titles, barmode, etc.)",
                        },
                    },
                    "required": ["data"],
                },
            },
            "required": ["title", "plotly_spec"],
        },
    },
    {
        "name": "finalize",
        "description": "End the current turn. Call this when you have fully answered the user's question.",
        "input_schema": {
            "type": "object",
            "properties": {
                "session_title": {
                    "type": ["string", "null"],
                    "description": "Short descriptive title for this session (only set after initial analysis, null otherwise)",
                },
                "suggestions": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Exactly 2 short follow-up questions the user might ask next, relevant to the current analysis",
                },
            },
            "required": ["suggestions"],
        },
    },
]


async def call_llm(
    client: anthropic.AsyncAnthropic,
    system_prompt: str,
    messages: list[dict],
    tools: list[dict],
) -> Any:
    """Call the Anthropic API with tools (non-streaming). Kept for test mocking."""
    return await client.messages.create(
        model=MODEL,
        max_tokens=4096,
        system=system_prompt,
        messages=messages,
        tools=tools,
    )


async def call_llm_streaming(
    client: anthropic.AsyncAnthropic,
    system_prompt: str,
    messages: list[dict],
    tools: list[dict],
    send_event: SendEvent,
) -> Any:
    """Call the Anthropic API with streaming. Sends text_delta events for output_text tool content."""
    logger.info("LLM call started (model=%s, messages=%d)", MODEL, len(messages))
    t0 = time.perf_counter()
    current_tool_name: str | None = None
    streaming_output_text = False
    # For incremental text extraction from partial JSON
    text_buffer = ""
    text_value_start = -1  # char position where the text string content begins
    text_sent_count = 0  # how many chars of text content we've already sent

    async with client.messages.stream(
        model=MODEL,
        max_tokens=4096,
        system=system_prompt,
        messages=messages,
        tools=tools,
    ) as stream:
        async for event in stream:
            if event.type == "content_block_start":
                block = event.content_block
                if hasattr(block, "type") and block.type == "tool_use":
                    current_tool_name = block.name
                    streaming_output_text = (current_tool_name == "output_text")
                    text_buffer = ""
                    text_value_start = -1
                    text_sent_count = 0
                else:
                    current_tool_name = None
                    streaming_output_text = False

            elif event.type == "content_block_delta":
                delta = event.delta
                if not (hasattr(delta, "type") and delta.type == "input_json_delta" and streaming_output_text):
                    continue

                text_buffer += delta.partial_json

                # Find where the text string value starts: after "text": "
                if text_value_start == -1:
                    for pattern in ('"text": "', '"text":"'):
                        idx = text_buffer.find(pattern)
                        if idx != -1:
                            text_value_start = idx + len(pattern)
                            break

                if text_value_start == -1:
                    continue

                # Extract current text content from the opening quote onward.
                # Hold back last 2 chars to avoid sending the closing "}
                # which is JSON syntax, not text content. The final "text"
                # event from tool execution delivers the complete clean text.
                raw = text_buffer[text_value_start:]
                sendable = raw[:-2] if len(raw) > 2 else ""
                if len(sendable) <= text_sent_count:
                    continue

                new_chunk = sendable[text_sent_count:]
                # Unescape common JSON string escapes
                new_chunk = (
                    new_chunk
                    .replace("\\n", "\n")
                    .replace("\\t", "\t")
                    .replace('\\"', '"')
                    .replace("\\\\", "\\")
                )
                if new_chunk:
                    await send_event("text_delta", {"delta": new_chunk})
                    text_sent_count = len(sendable)

            elif event.type == "content_block_stop":
                streaming_output_text = False
                current_tool_name = None
                text_buffer = ""
                text_value_start = -1
                text_sent_count = 0

        response = await stream.get_final_message()

    elapsed = time.perf_counter() - t0
    usage = response.usage
    logger.info(
        "LLM call completed in %.2fs (input_tokens=%d, output_tokens=%d, stop_reason=%s)",
        elapsed,
        usage.input_tokens,
        usage.output_tokens,
        response.stop_reason,
    )
    return response


async def run_agent(
    session_id: str,
    file_path: str,
    is_initial_analysis: bool,
    send_event: SendEvent,
    db: DBSession,
    file_metadata: dict[str, Any] | None = None,
    db_messages: list[dict] | None = None,
    should_stop: bool = False,
) -> None:
    """Run the planner agent loop.

    Args:
        session_id: The session this conversation belongs to.
        file_path: Path to the uploaded data file on disk.
        is_initial_analysis: True for auto_analyze (Prompt 1), False for user questions (Prompt 2).
        send_event: Async callable to stream events to the frontend.
        db: SQLAlchemy database session.
        file_metadata: Dict with row_count, col_count, column_types. Built from file if not provided.
        db_messages: Pre-loaded conversation history. Loaded from DB if not provided.
        should_stop: If True, skip execution and send done immediately.
    """
    logger.info(
        "=== Agent run started (session=%s, initial_analysis=%s) ===",
        session_id, is_initial_analysis,
    )

    # Early exit on stop
    if should_stop:
        logger.info("Agent run skipped (should_stop=True)")
        await send_event("done", {"data_updated": False})
        return

    await send_event("status", {"message": "Thinking..."})

    # Build file metadata if not provided (run in thread — DuckDB is blocking)
    if not file_metadata:
        logger.debug("Building file metadata from disk: %s", file_path)
        file_metadata = await asyncio.to_thread(_get_file_metadata, file_path)

    logger.info(
        "File metadata: %d rows, %d columns",
        file_metadata["row_count"], file_metadata["col_count"],
    )

    # Build system prompt
    data_summary = build_data_summary(
        row_count=file_metadata["row_count"],
        col_count=file_metadata["col_count"],
        column_types=file_metadata["column_types"],
        column_profiles=file_metadata.get("column_profiles"),
    )
    system_prompt = get_system_prompt(is_initial_analysis, data_summary)

    # Build conversation history for the LLM
    if db_messages is None:
        db_messages = []
    llm_messages = build_messages_for_llm(db_messages)

    # For initial analysis, add a synthetic user message
    if is_initial_analysis:
        llm_messages.append({"role": "user", "content": "Analyze this dataset."})

    # Create Anthropic client
    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

    # Create a shared DuckDB connection for the entire agent run
    conn = await asyncio.to_thread(create_duckdb_connection, file_path)

    logger.info("Conversation history: %d messages for LLM", len(llm_messages))

    try:
        # Agent loop
        for iteration in range(MAX_ITERATIONS):
            logger.info("--- Iteration %d/%d ---", iteration + 1, MAX_ITERATIONS)
            response = await call_llm_streaming(client, system_prompt, llm_messages, TOOL_DEFINITIONS, send_event)

            # Extract reasoning text and tool calls from response
            reasoning_parts = []
            tool_calls = []
            for block in response.content:
                if isinstance(block, dict):
                    if block["type"] == "text":
                        reasoning_parts.append(block["text"])
                    elif block["type"] == "tool_use":
                        tool_calls.append(block)
                else:
                    if block.type == "text":
                        reasoning_parts.append(block.text)
                    elif block.type == "tool_use":
                        tool_calls.append(block)

            # Save reasoning if present
            reasoning_text = "\n".join(reasoning_parts).strip()
            if reasoning_text:
                logger.info("Reasoning:\n%s", reasoning_text)
                save_reasoning(db, session_id, reasoning_text)

            # No tool calls — agent is done (shouldn't happen normally, but safety net)
            if not tool_calls:
                logger.info("No tool calls returned — ending agent loop")
                await send_event("done", {"data_updated": False})
                return

            # Parse tool call metadata
            parsed_calls = []
            for tc in tool_calls:
                tool_name = tc["name"] if isinstance(tc, dict) else tc.name
                tool_input = tc["input"] if isinstance(tc, dict) else tc.input
                tool_id = tc["id"] if isinstance(tc, dict) else tc.id
                parsed_calls.append((tool_id, tool_name, tool_input))

            logger.info(
                "Tool calls (%d): %s",
                len(parsed_calls),
                ", ".join(f"{name}(id={tid})" for tid, name, _ in parsed_calls),
            )
            for tid, name, inp in parsed_calls:
                if name == "sql_query":
                    logger.info("  sql_query: %s", inp.get("query", ""))
                elif name == "output_text":
                    preview = (inp.get("text") or "")[:120]
                    logger.info("  output_text: %s...", preview)
                elif name == "create_plot":
                    logger.info("  create_plot: title=%s", inp.get("title"))
                elif name == "output_table":
                    logger.info("  output_table: title=%s, rows=%d", inp.get("title"), len(inp.get("rows", [])))
                elif name == "finalize":
                    logger.info("  finalize: session_title=%s", inp.get("session_title"))

            # Send status events before executing
            for tool_id, tool_name, tool_input in parsed_calls:
                if tool_name == "sql_query" and tool_input.get("description"):
                    await send_event("status", {"message": tool_input["description"]})

            # Execute tool calls in parallel
            async def _run_tool(tool_name: str, tool_input: dict) -> dict[str, Any]:
                return await _execute_tool_core(
                    tool_name=tool_name,
                    tool_input=tool_input,
                    file_path=file_path,
                    send_event=send_event,
                    db=db,
                    session_id=session_id,
                    conn=conn,
                )

            t_tools = time.perf_counter()
            results = await asyncio.gather(
                *[_run_tool(name, inp) for _, name, inp in parsed_calls]
            )
            logger.info("All tools executed in %.2fs", time.perf_counter() - t_tools)

            # Persist and build tool results in original order
            tool_results = []
            finalize_called = False
            for (tool_id, tool_name, tool_input), result in zip(parsed_calls, results):
                if result.get("is_error"):
                    logger.warning("Tool %s returned error: %s", tool_name, result.get("error"))
                elif tool_name == "sql_query":
                    logger.info(
                        "Tool sql_query result: %d rows, %d columns",
                        result.get("row_count", 0), len(result.get("columns", [])),
                    )
                else:
                    logger.info("Tool %s result: ok=%s", tool_name, result.get("ok"))
                _persist_tool_result(db, session_id, tool_name, tool_input, result)

                tool_results.append({
                    "type": "tool_result",
                    "tool_use_id": tool_id,
                    "content": json.dumps(result),
                })
                if tool_name == "finalize":
                    finalize_called = True

            # Append assistant message + tool results to conversation
            assistant_content = []
            for block in response.content:
                if isinstance(block, dict):
                    assistant_content.append(block)
                else:
                    if block.type == "text":
                        assistant_content.append({"type": "text", "text": block.text})
                    elif block.type == "tool_use":
                        assistant_content.append({
                            "type": "tool_use",
                            "id": block.id,
                            "name": block.name,
                            "input": block.input,
                        })

            llm_messages.append({"role": "assistant", "content": assistant_content})
            llm_messages.append({"role": "user", "content": tool_results})

            if finalize_called:
                logger.info("=== Agent run finished (finalized) ===")
                return

        # Max iterations reached — force done
        logger.warning("=== Agent run stopped: max iterations (%d) reached ===", MAX_ITERATIONS)
        await send_event("done", {"data_updated": False})
    finally:
        conn.close()


async def _execute_tool_core(
    tool_name: str,
    tool_input: dict,
    file_path: str,
    send_event: SendEvent,
    db: DBSession,
    session_id: str,
    conn=None,
) -> dict[str, Any]:
    """Execute a single tool call without persisting. Persistence handled by caller."""
    if tool_name == "sql_query":
        return await execute_sql_query(
            query=tool_input["query"],
            description=tool_input["description"],
            file_path=file_path,
            conn=conn,
        )

    elif tool_name == "output_text":
        return await execute_output_text(
            text=tool_input["text"],
            send_event=send_event,
        )

    elif tool_name == "output_table":
        return await execute_output_table(
            title=tool_input["title"],
            headers=tool_input["headers"],
            rows=tool_input["rows"],
            send_event=send_event,
        )

    elif tool_name == "create_plot":
        return await execute_create_plot(
            title=tool_input["title"],
            plotly_spec=tool_input["plotly_spec"],
            send_event=send_event,
        )

    elif tool_name == "finalize":
        return await execute_finalize(
            session_title=tool_input.get("session_title"),
            suggestions=tool_input.get("suggestions", []),
            send_event=send_event,
            db=db,
            session_id=session_id,
        )

    else:
        return {"error": f"Unknown tool: {tool_name}"}


def _persist_tool_result(
    db: DBSession,
    session_id: str,
    tool_name: str,
    tool_input: dict,
    result: dict[str, Any],
) -> None:
    """Persist a tool result to the database. Called sequentially after parallel execution."""
    if tool_name == "sql_query":
        save_tool_message(
            db=db,
            session_id=session_id,
            tool_name="sql_query",
            text=tool_input["description"],
            plot_data=json.dumps({
                "query": tool_input["query"],
                "columns": result.get("columns", []),
                "rows": result.get("rows", []),
                "row_count": result.get("row_count", 0),
            }),
        )
    elif tool_name == "output_text":
        save_tool_message(
            db=db,
            session_id=session_id,
            tool_name="output_text",
            text=tool_input["text"],
            plot_data=None,
        )
    elif tool_name == "output_table":
        save_tool_message(
            db=db,
            session_id=session_id,
            tool_name="output_table",
            text=tool_input["title"],
            plot_data=json.dumps({
                "headers": tool_input["headers"],
                "rows": tool_input["rows"],
            }),
        )
    elif tool_name == "create_plot":
        save_tool_message(
            db=db,
            session_id=session_id,
            tool_name="create_plot",
            text=tool_input["title"],
            plot_data=json.dumps({
                "title": tool_input["title"],
                "plotly_spec": tool_input["plotly_spec"],
            }),
        )
    # finalize doesn't need persistence — it updates session title inline


def _get_file_metadata(file_path: str) -> dict[str, Any]:
    """Extract metadata from the file using DuckDB."""
    import duckdb, os

    abs_path = os.path.abspath(file_path)
    ext = os.path.splitext(file_path)[1].lower()
    read_fn = f"read_csv_auto('{abs_path}')" if ext == ".csv" else f"read_parquet('{abs_path}')"

    conn = duckdb.connect()
    try:
        row_count = conn.execute(f"SELECT COUNT(*) FROM {read_fn}").fetchone()[0]
        describe = conn.execute(f"DESCRIBE SELECT * FROM {read_fn}").fetchall()
        column_types = {row[0]: row[1] for row in describe}
        return {
            "row_count": row_count,
            "col_count": len(column_types),
            "column_types": column_types,
        }
    finally:
        conn.close()
