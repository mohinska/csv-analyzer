"""Tool executor functions — each tool is an async function that streams events and returns a result."""

import asyncio
import json
import logging
import os
import time
from typing import Any, Callable, Awaitable

import duckdb
from sqlalchemy.orm import Session as DBSession

from backend.app.agent.sql_sanitizer import validate_sql
from backend.app.models.session import Session

logger = logging.getLogger("agent.tools")

SendEvent = Callable[[str, dict], Awaitable[None]]

MAX_QUERY_ROWS = 50
MAX_PLOT_ROWS = 100


def create_duckdb_connection(file_path: str) -> duckdb.DuckDBPyConnection:
    """Create a DuckDB connection with a `data` view pointing to the file."""
    abs_path = os.path.abspath(file_path)
    ext = os.path.splitext(file_path)[1].lower()

    conn = duckdb.connect()
    if ext == ".csv":
        conn.execute(f"CREATE VIEW data AS SELECT * FROM read_csv_auto('{abs_path}')")
    elif ext in (".parquet", ".pq"):
        conn.execute(f"CREATE VIEW data AS SELECT * FROM read_parquet('{abs_path}')")
    return conn


async def execute_sql_query(
    query: str,
    description: str,
    file_path: str,
    conn: duckdb.DuckDBPyConnection | None = None,
    max_rows: int = MAX_QUERY_ROWS,
) -> dict[str, Any]:
    """Execute a SQL query against the dataset. Status is sent from graph.py before calling this."""
    logger.debug("execute_sql_query: %s", query)
    # Validate SQL first
    try:
        validate_sql(query)
    except ValueError as e:
        logger.warning("SQL validation failed: %s — query: %s", e, query)
        return {
            "is_error": True,
            "error": str(e),
            "columns": [],
            "rows": [],
            "row_count": 0,
        }

    def _run_query() -> dict[str, Any]:
        """Run query synchronously in a thread so the event loop stays free."""
        # Use a cursor from shared connection (thread-safe) or create a standalone one
        if conn is not None:
            cursor = conn.cursor()
            owns_connection = False
        else:
            cursor = create_duckdb_connection(file_path)
            owns_connection = True
        try:
            wrapped = f"SELECT * FROM ({query}) _sub LIMIT {max_rows}"
            result = cursor.execute(wrapped)
            columns = [desc[0] for desc in result.description]
            rows = [list(row) for row in result.fetchall()]

            count_result = cursor.execute(f"SELECT COUNT(*) FROM ({query}) _sub").fetchone()
            total_rows = count_result[0] if count_result else len(rows)

            for row in rows:
                for i, val in enumerate(row):
                    if val is not None and not isinstance(val, (str, int, float, bool)):
                        row[i] = str(val)

            return {
                "columns": columns,
                "rows": rows,
                "row_count": total_rows,
                "is_error": False,
            }
        except duckdb.Error as e:
            return {
                "is_error": True,
                "error": str(e),
                "columns": [],
                "rows": [],
                "row_count": 0,
            }
        finally:
            cursor.close()
            if owns_connection:
                pass  # cursor IS the connection in fallback case, already closed

    t0 = time.perf_counter()
    result = await asyncio.to_thread(_run_query)
    elapsed = time.perf_counter() - t0
    if result.get("is_error"):
        logger.warning("SQL execution error (%.2fs): %s", elapsed, result.get("error"))
    else:
        logger.debug("SQL executed in %.2fs — %d rows returned", elapsed, result.get("row_count", 0))
    return result


async def execute_output_text(
    text: str,
    send_event: SendEvent,
) -> dict[str, Any]:
    """Send a text message to the user."""
    logger.debug("execute_output_text: %d chars", len(text))
    await send_event("text", {"text": text})
    return {"ok": True}


async def execute_output_table(
    title: str,
    headers: list[str],
    rows: list[list],
    send_event: SendEvent,
) -> dict[str, Any]:
    """Send a structured table to the user."""
    logger.debug("execute_output_table: title=%s, %d cols x %d rows", title, len(headers), len(rows))
    await send_event("table", {
        "title": title,
        "headers": headers,
        "rows": rows,
    })
    return {"ok": True}


async def execute_create_plot(
    title: str,
    plotly_spec: dict,
    send_event: SendEvent,
) -> dict[str, Any]:
    """Send a Plotly.js plot to the user. Truncates trace data to MAX_PLOT_ROWS."""
    logger.debug("execute_create_plot: title=%s", title)
    # Enforce row limit on each trace's data arrays
    for trace in plotly_spec.get("data", []):
        for key in ("x", "y", "z", "values", "labels", "text", "customdata"):
            if key in trace and isinstance(trace[key], list) and len(trace[key]) > MAX_PLOT_ROWS:
                trace[key] = trace[key][:MAX_PLOT_ROWS]

    await send_event("plot", {
        "title": title,
        "plotly_spec": plotly_spec,
    })
    return {"ok": True}


async def execute_finalize(
    session_title: str | None,
    send_event: SendEvent,
    suggestions: list[str] | None = None,
    db: DBSession | None = None,
    session_id: str | None = None,
) -> dict[str, Any]:
    """End the current turn. Optionally set the session title."""
    logger.debug("execute_finalize: session_title=%s, suggestions=%s", session_title, suggestions)
    if session_title and db and session_id:
        session = db.query(Session).filter(Session.id == session_id).first()
        if session:
            session.title = session_title
            db.commit()
        await send_event("session_update", {"title": session_title})

    await send_event("done", {"data_updated": False, "suggestions": suggestions or []})
    return {"ok": True}
