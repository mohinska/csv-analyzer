"""Agent graph — the core planner loop using Anthropic tool-use API."""

import asyncio
import json
from typing import Any, Callable, Awaitable

import anthropic
from sqlalchemy.orm import Session as DBSession

from backend.app.agent.context import build_data_summary, get_system_prompt, build_messages_for_llm
from backend.app.agent.persistence import save_reasoning, save_tool_message
from backend.app.agent.tools import (
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
            "Create a visualization using Vega-Lite. The spec must be a valid Vega-Lite v5 JSON specification. "
            "Do NOT include a $schema field. "
            "Include the data inline as data.values (array of objects). "
            "Always aggregate data with sql_query first — keep data.values under 100 rows. "
            "Use field names matching your query results. "
            "Keep specs simple: bar, line, scatter, histogram, boxplot, heatmap. "
            "Use 'width': 'container' for responsive sizing."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "title": {"type": "string", "description": "Chart title"},
                "vega_lite_spec": {"type": "object", "description": "Vega-Lite v5 spec (with inline data.values)"},
            },
            "required": ["title", "vega_lite_spec"],
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
            },
            "required": [],
        },
    },
]


async def call_llm(
    client: anthropic.AsyncAnthropic,
    system_prompt: str,
    messages: list[dict],
    tools: list[dict],
) -> Any:
    """Call the Anthropic API with tools. Separated for easy mocking in tests."""
    return await client.messages.create(
        model=MODEL,
        max_tokens=4096,
        system=system_prompt,
        messages=messages,
        tools=tools,
    )


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
    # Early exit on stop
    if should_stop:
        await send_event("done", {"data_updated": False})
        return

    await send_event("status", {"message": "Thinking..."})

    # Build file metadata if not provided (run in thread — DuckDB is blocking)
    if not file_metadata:
        file_metadata = await asyncio.to_thread(_get_file_metadata, file_path)

    # Build system prompt
    data_summary = build_data_summary(
        row_count=file_metadata["row_count"],
        col_count=file_metadata["col_count"],
        column_types=file_metadata["column_types"],
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

    # Agent loop
    for _ in range(MAX_ITERATIONS):
        response = await call_llm(client, system_prompt, llm_messages, TOOL_DEFINITIONS)

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
            save_reasoning(db, session_id, reasoning_text)

        # No tool calls — agent is done (shouldn't happen normally, but safety net)
        if not tool_calls:
            await send_event("done", {"data_updated": False})
            return

        # Execute tool calls and collect results
        tool_results = []
        finalize_called = False

        for tc in tool_calls:
            tool_name = tc["name"] if isinstance(tc, dict) else tc.name
            tool_input = tc["input"] if isinstance(tc, dict) else tc.input
            tool_id = tc["id"] if isinstance(tc, dict) else tc.id

            # Send status before sql_query so user sees what's happening
            if tool_name == "sql_query" and tool_input.get("description"):
                await send_event("status", {"message": tool_input["description"]})
                await asyncio.sleep(0.05)  # let TCP flush the status frame

            result = await _execute_tool(
                tool_name=tool_name,
                tool_input=tool_input,
                file_path=file_path,
                send_event=send_event,
                db=db,
                session_id=session_id,
            )

            tool_results.append({
                "type": "tool_result",
                "tool_use_id": tool_id,
                "content": json.dumps(result),
            })

            if tool_name == "finalize":
                finalize_called = True

        # Append assistant message + tool results to conversation
        # Build assistant content for the messages list
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
            return

    # Max iterations reached — force done
    await send_event("done", {"data_updated": False})


async def _execute_tool(
    tool_name: str,
    tool_input: dict,
    file_path: str,
    send_event: SendEvent,
    db: DBSession,
    session_id: str,
) -> dict[str, Any]:
    """Execute a single tool call and persist the result."""
    if tool_name == "sql_query":
        result = await execute_sql_query(
            query=tool_input["query"],
            description=tool_input["description"],
            file_path=file_path,
        )
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
        return result

    elif tool_name == "output_text":
        result = await execute_output_text(
            text=tool_input["text"],
            send_event=send_event,
        )
        save_tool_message(
            db=db,
            session_id=session_id,
            tool_name="output_text",
            text=tool_input["text"],
            plot_data=None,
        )
        return result

    elif tool_name == "output_table":
        result = await execute_output_table(
            title=tool_input["title"],
            headers=tool_input["headers"],
            rows=tool_input["rows"],
            send_event=send_event,
        )
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
        return result

    elif tool_name == "create_plot":
        result = await execute_create_plot(
            title=tool_input["title"],
            vega_lite_spec=tool_input["vega_lite_spec"],
            send_event=send_event,
        )
        save_tool_message(
            db=db,
            session_id=session_id,
            tool_name="create_plot",
            text=tool_input["title"],
            plot_data=json.dumps({
                "title": tool_input["title"],
                "vega_lite_spec": tool_input["vega_lite_spec"],
            }),
        )
        return result

    elif tool_name == "finalize":
        result = await execute_finalize(
            session_title=tool_input.get("session_title"),
            send_event=send_event,
            db=db,
            session_id=session_id,
        )
        return result

    else:
        return {"error": f"Unknown tool: {tool_name}"}


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
