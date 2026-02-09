"""Tool executor functions — each tool is an async function that streams events and returns a result."""

import asyncio
import json
import os
from typing import Any, Callable, Awaitable

import duckdb
from sqlalchemy.orm import Session as DBSession

from backend.app.agent.sql_sanitizer import validate_sql
from backend.app.models.session import Session

SendEvent = Callable[[str, dict], Awaitable[None]]

MAX_QUERY_ROWS = 50
MAX_PLOT_ROWS = 100


def _create_duckdb_connection(file_path: str) -> duckdb.DuckDBPyConnection:
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
    max_rows: int = MAX_QUERY_ROWS,
) -> dict[str, Any]:
    """Execute a SQL query against the dataset. Status is sent from graph.py before calling this."""
    # Validate SQL first
    try:
        validate_sql(query)
    except ValueError as e:
        return {
            "is_error": True,
            "error": str(e),
            "columns": [],
            "rows": [],
            "row_count": 0,
        }

    def _run_query() -> dict[str, Any]:
        """Run query synchronously in a thread so the event loop stays free."""
        conn = _create_duckdb_connection(file_path)
        try:
            wrapped = f"SELECT * FROM ({query}) _sub LIMIT {max_rows}"
            result = conn.execute(wrapped)
            columns = [desc[0] for desc in result.description]
            rows = [list(row) for row in result.fetchall()]

            count_result = conn.execute(f"SELECT COUNT(*) FROM ({query}) _sub").fetchone()
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
            conn.close()

    result = await asyncio.to_thread(_run_query)
    return result


async def execute_output_text(
    text: str,
    send_event: SendEvent,
) -> dict[str, Any]:
    """Send a text message to the user."""
    await send_event("text", {"text": text})
    return {"ok": True}


async def execute_output_table(
    title: str,
    headers: list[str],
    rows: list[list],
    send_event: SendEvent,
) -> dict[str, Any]:
    """Send a structured table to the user."""
    await send_event("table", {
        "title": title,
        "headers": headers,
        "rows": rows,
    })
    return {"ok": True}


async def execute_create_plot(
    title: str,
    vega_lite_spec: dict,
    send_event: SendEvent,
) -> dict[str, Any]:
    """Send a Vega-Lite plot to the user. Truncates data to MAX_PLOT_ROWS."""
    # Enforce row limit on inline data
    if "data" in vega_lite_spec and "values" in vega_lite_spec["data"]:
        values = vega_lite_spec["data"]["values"]
        if len(values) > MAX_PLOT_ROWS:
            vega_lite_spec["data"]["values"] = values[:MAX_PLOT_ROWS]

    await send_event("plot", {
        "title": title,
        "vega_lite_spec": vega_lite_spec,
    })
    return {"ok": True}


async def execute_finalize(
    session_title: str | None,
    send_event: SendEvent,
    db: DBSession | None = None,
    session_id: str | None = None,
) -> dict[str, Any]:
    """End the current turn. Optionally set the session title."""
    if session_title and db and session_id:
        session = db.query(Session).filter(Session.id == session_id).first()
        if session:
            session.title = session_title
            db.commit()
        await send_event("session_update", {"title": session_title})

    await send_event("done", {"data_updated": False})
    return {"ok": True}
