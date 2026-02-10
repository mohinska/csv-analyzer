import os
import shutil
from pathlib import Path
from typing import Any

import duckdb

from backend.app.config import settings

ALLOWED_EXTENSIONS = {".csv", ".parquet", ".pq"}


def get_file_extension(filename: str) -> str:
    return Path(filename).suffix.lower()


def validate_extension(filename: str) -> None:
    ext = get_file_extension(filename)
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError(f"Unsupported file format: {ext}. Allowed: .csv, .parquet, .pq")


def save_upload(session_id: str, filename: str, content: bytes) -> str:
    """Save uploaded file to data/{session_id}/original.{ext}. Returns path on disk."""
    ext = get_file_extension(filename)
    session_dir = os.path.join(settings.DATA_DIR, session_id)
    os.makedirs(session_dir, exist_ok=True)

    file_path = os.path.join(session_dir, f"original{ext}")
    with open(file_path, "wb") as f:
        f.write(content)

    return file_path


def cleanup_session_dir(session_id: str) -> None:
    """Remove session data directory if it exists."""
    session_dir = os.path.join(settings.DATA_DIR, session_id)
    if os.path.exists(session_dir):
        shutil.rmtree(session_dir)


NUMERIC_TYPES = frozenset({
    "INTEGER", "BIGINT", "DOUBLE", "FLOAT", "DECIMAL", "HUGEINT",
    "SMALLINT", "TINYINT", "UINTEGER", "UBIGINT", "USMALLINT", "UTINYINT",
})


def validate_and_preview(file_path: str) -> dict[str, Any]:
    """
    Open file with DuckDB, validate it, and return metadata + 500-row preview + column profiles.

    Returns:
        {
            "row_count": int,
            "column_count": int,
            "columns": list[str],
            "column_types": dict[str, str],
            "column_profiles": dict[str, dict],
            "preview": list[dict[str, Any]]
        }

    Raises ValueError on validation failure.
    """
    abs_path = os.path.abspath(file_path)
    ext = get_file_extension(file_path)
    if ext == ".csv":
        read_fn = f"read_csv_auto('{abs_path}')"
    elif ext in (".parquet", ".pq"):
        read_fn = f"read_parquet('{abs_path}')"
    else:
        raise ValueError(f"Unsupported file format: {ext}")

    conn = duckdb.connect()
    try:
        conn.execute(f"CREATE VIEW data AS SELECT * FROM {read_fn}")

        # Get row count
        row_count = conn.execute("SELECT COUNT(*) FROM data").fetchone()[0]
        if row_count == 0:
            raise ValueError("File contains no data rows")

        # Get columns and types
        describe = conn.execute("DESCRIBE data").fetchall()
        columns = [row[0] for row in describe]
        column_types = {row[0]: row[1] for row in describe}
        column_count = len(columns)
        if column_count == 0:
            raise ValueError("File contains no columns")

        # Compute per-column profiles
        column_profiles = {}
        for col_name, col_type in column_types.items():
            profile: dict[str, Any] = {"type": col_type}
            q = f'"{col_name}"'

            null_count = conn.execute(f"SELECT COUNT(*) FROM data WHERE {q} IS NULL").fetchone()[0]
            profile["null_count"] = null_count

            unique_count = conn.execute(f"SELECT COUNT(DISTINCT {q}) FROM data").fetchone()[0]
            profile["unique_count"] = unique_count

            # Numeric stats
            base_type = col_type.split("(")[0].upper()
            if base_type in NUMERIC_TYPES:
                stats = conn.execute(f"""
                    SELECT MIN({q}), MAX({q}), AVG({q}), MEDIAN({q})
                    FROM data
                """).fetchone()
                profile["min"] = _safe_number(stats[0])
                profile["max"] = _safe_number(stats[1])
                profile["mean"] = _safe_round(stats[2])
                profile["median"] = _safe_number(stats[3])

            # Sample values (up to 5 distinct)
            samples = conn.execute(f"""
                SELECT DISTINCT {q} FROM data WHERE {q} IS NOT NULL LIMIT 5
            """).fetchall()
            profile["sample_values"] = [str(s[0]) for s in samples]

            column_profiles[col_name] = profile

        # Get preview (up to 500 rows)
        preview_result = conn.execute("SELECT * FROM data LIMIT 500")
        col_names = [desc[0] for desc in preview_result.description]
        rows = preview_result.fetchall()

        preview = []
        for row in rows:
            row_dict: dict[str, Any] = {}
            for i, val in enumerate(row):
                if val is None:
                    row_dict[col_names[i]] = None
                else:
                    row_dict[col_names[i]] = val
            preview.append(row_dict)

        return {
            "row_count": row_count,
            "column_count": column_count,
            "columns": columns,
            "column_types": column_types,
            "column_profiles": column_profiles,
            "preview": preview,
        }
    except duckdb.Error as e:
        raise ValueError(f"Could not parse file: {e}")
    finally:
        conn.close()


def _safe_number(val: Any) -> Any:
    """Convert to Python native number, handling None and special types."""
    if val is None:
        return None
    if isinstance(val, (int, float)):
        return val
    return str(val)


def _safe_round(val: Any, decimals: int = 4) -> Any:
    """Round a numeric value, handling None."""
    if val is None:
        return None
    try:
        return round(float(val), decimals)
    except (TypeError, ValueError):
        return str(val)
