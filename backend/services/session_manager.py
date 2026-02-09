import uuid
import json
import math
import pandas as pd
import numpy as np
from pathlib import Path
from datetime import datetime
from typing import Optional
from backend.models.schemas import SessionInfo


class _SafeJSONEncoder(json.JSONEncoder):
    """JSON encoder that handles NaN, Infinity, and numpy types."""

    def default(self, obj):
        if isinstance(obj, (np.integer,)):
            return int(obj)
        if isinstance(obj, (np.floating,)):
            val = float(obj)
            if math.isnan(val) or math.isinf(val):
                return None
            return val
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        if isinstance(obj, (np.bool_,)):
            return bool(obj)
        if isinstance(obj, pd.Timestamp):
            return obj.isoformat()
        return super().default(obj)


def _sanitize_value(val):
    """Sanitize a single value for JSON serialization."""
    if val is None:
        return None
    if isinstance(val, float):
        if math.isnan(val) or math.isinf(val):
            return None
        return val
    if isinstance(val, (np.floating,)):
        f = float(val)
        if math.isnan(f) or math.isinf(f):
            return None
        return f
    if isinstance(val, (np.integer,)):
        return int(val)
    if isinstance(val, (np.bool_,)):
        return bool(val)
    if isinstance(val, pd.Timestamp):
        return val.isoformat()
    if isinstance(val, np.ndarray):
        return val.tolist()
    return val


def _sanitize_obj(obj):
    """Recursively sanitize an object for JSON serialization."""
    if isinstance(obj, dict):
        return {k: _sanitize_obj(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize_obj(v) for v in obj]
    return _sanitize_value(obj)


def _safe_json_dumps(obj, **kwargs) -> str:
    """JSON dumps that handles NaN/Infinity/numpy types."""
    sanitized = _sanitize_obj(obj)
    return json.dumps(sanitized, cls=_SafeJSONEncoder, **kwargs)


def _sanitize_preview(df: pd.DataFrame, n: int = 100) -> list[dict]:
    """Convert DataFrame head to list of dicts with NaN replaced by None."""
    records = df.head(n).to_dict(orient="records")
    return _sanitize_obj(records)


class SessionManager:
    """Manages user sessions and their data files with disk persistence."""

    def __init__(self, data_dir: Path):
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self._sessions: dict[str, SessionInfo] = {}
        # Load existing sessions from disk
        self._load_existing_sessions()

    def _load_existing_sessions(self):
        """Load all existing sessions from disk on startup."""
        if not self.data_dir.exists():
            return

        for session_dir in self.data_dir.iterdir():
            if session_dir.is_dir():
                session_id = session_dir.name
                session_info = self._load_session_from_disk(session_id)
                if session_info:
                    self._sessions[session_id] = session_info
                    print(f"[SessionManager] Loaded session: {session_id}")

    def _load_session_from_disk(self, session_id: str) -> Optional[SessionInfo]:
        """Load session info from disk."""
        session_dir = self.data_dir / session_id
        metadata_file = session_dir / "session.json"

        if metadata_file.exists():
            try:
                data = json.loads(metadata_file.read_text(encoding="utf-8"))
                return SessionInfo(
                    session_id=data["session_id"],
                    has_file=data["has_file"],
                    filename=data.get("filename"),
                    row_count=data.get("row_count"),
                    column_count=data.get("column_count"),
                    columns=data.get("columns"),
                    created_at=datetime.fromisoformat(data["created_at"]),
                )
            except Exception as e:
                print(f"[SessionManager] Failed to load session {session_id}: {e}")
                return None

        # Fallback: check if original.csv exists (old format without session.json)
        original_file = session_dir / "original.csv"
        if original_file.exists():
            try:
                df = pd.read_csv(original_file)
                return SessionInfo(
                    session_id=session_id,
                    has_file=True,
                    filename="original.csv",
                    row_count=len(df),
                    column_count=len(df.columns),
                    columns=df.columns.tolist(),
                    created_at=datetime.fromtimestamp(original_file.stat().st_mtime),
                )
            except Exception as e:
                print(f"[SessionManager] Failed to read CSV for session {session_id}: {e}")
                return None

        return None

    def _save_session_to_disk(self, session_id: str):
        """Save session metadata to disk."""
        session = self._sessions.get(session_id)
        if not session:
            return

        session_dir = self.data_dir / session_id
        session_dir.mkdir(parents=True, exist_ok=True)
        metadata_file = session_dir / "session.json"

        data = {
            "session_id": session.session_id,
            "has_file": session.has_file,
            "filename": session.filename,
            "row_count": session.row_count,
            "column_count": session.column_count,
            "columns": session.columns,
            "created_at": session.created_at.isoformat(),
        }

        metadata_file.write_text(json.dumps(data, indent=2), encoding="utf-8")

    def create_session(self) -> str:
        """Create a new session and return its ID."""
        session_id = str(uuid.uuid4())[:8]
        session_dir = self.data_dir / session_id
        session_dir.mkdir(parents=True, exist_ok=True)

        self._sessions[session_id] = SessionInfo(
            session_id=session_id,
            has_file=False,
            created_at=datetime.now(),
        )
        self._save_session_to_disk(session_id)
        return session_id

    def get_session(self, session_id: str) -> Optional[SessionInfo]:
        """Get session info by ID."""
        # First check memory
        if session_id in self._sessions:
            return self._sessions[session_id]

        # Try to load from disk
        session_info = self._load_session_from_disk(session_id)
        if session_info:
            self._sessions[session_id] = session_info
            return session_info

        return None

    def session_has_file(self, session_id: str) -> bool:
        """Check if session has an uploaded file."""
        session = self.get_session(session_id)
        return session.has_file if session else False

    def get_session_dir(self, session_id: str) -> Path:
        """Get the directory for a session."""
        return self.data_dir / session_id

    @staticmethod
    def _is_parquet(filename: str) -> bool:
        """Check if a filename indicates a Parquet file."""
        return filename.lower().endswith((".parquet", ".pq"))

    def save_file(self, session_id: str, filename: str, content: bytes) -> dict:
        """
        Save uploaded file (CSV or Parquet) and return metadata.
        Saves as both original and current copies (CSV internally for transformations).
        Returns dict with row_count, column_count, columns, preview.
        """
        # Ensure session exists
        if session_id not in self._sessions:
            self._sessions[session_id] = SessionInfo(
                session_id=session_id,
                has_file=False,
                created_at=datetime.now(),
            )

        session_dir = self.get_session_dir(session_id)
        session_dir.mkdir(parents=True, exist_ok=True)

        # Parse file based on type
        if self._is_parquet(filename):
            import io
            df = pd.read_parquet(io.BytesIO(content))
            # Save original as parquet
            original_path = session_dir / "original.parquet"
            original_path.write_bytes(content)
        else:
            # Save original CSV bytes
            original_path = session_dir / "original.csv"
            original_path.write_bytes(content)
            df = pd.read_csv(original_path)

        # Always save current as CSV (working copy for transformations)
        current_path = session_dir / "current.csv"
        df.to_csv(current_path, index=False)

        metadata = {
            "row_count": len(df),
            "column_count": len(df.columns),
            "columns": df.columns.tolist(),
            "preview": _sanitize_preview(df),
        }

        # Update session
        self._sessions[session_id] = SessionInfo(
            session_id=session_id,
            has_file=True,
            filename=filename,
            row_count=metadata["row_count"],
            column_count=metadata["column_count"],
            columns=metadata["columns"],
            created_at=self._sessions[session_id].created_at,
        )

        # Persist to disk
        self._save_session_to_disk(session_id)

        return metadata

    def get_dataframe(self, session_id: str, use_current: bool = True) -> Optional[pd.DataFrame]:
        """
        Load the CSV file for a session as DataFrame.

        Args:
            session_id: The session ID
            use_current: If True, load current.csv (may have transformations).
                        If False, load original.csv (always unchanged).
        """
        if not self.session_has_file(session_id):
            return None

        session_dir = self.get_session_dir(session_id)

        # Try current first, fall back to original
        if use_current:
            file_path = session_dir / "current.csv"
            if not file_path.exists():
                file_path = session_dir / "original.csv"
        else:
            file_path = session_dir / "original.csv"

        if file_path.exists():
            return pd.read_csv(file_path)
        return None

    def get_original_dataframe(self, session_id: str) -> Optional[pd.DataFrame]:
        """Load the original (unmodified) CSV file."""
        return self.get_dataframe(session_id, use_current=False)

    def save_transformed_dataframe(self, session_id: str, df: pd.DataFrame) -> dict:
        """
        Save a transformed DataFrame as the new current version.
        Original file remains unchanged.
        Returns updated metadata.
        """
        if not self.session_has_file(session_id):
            raise ValueError(f"Session {session_id} has no file")

        session_dir = self.get_session_dir(session_id)
        current_path = session_dir / "current.csv"

        # Save transformed data
        df.to_csv(current_path, index=False)

        # Update metadata
        metadata = {
            "row_count": len(df),
            "column_count": len(df.columns),
            "columns": df.columns.tolist(),
            "preview": _sanitize_preview(df),
        }

        # Update session info
        session = self._sessions[session_id]
        self._sessions[session_id] = SessionInfo(
            session_id=session.session_id,
            has_file=True,
            filename=session.filename,
            row_count=metadata["row_count"],
            column_count=metadata["column_count"],
            columns=metadata["columns"],
            created_at=session.created_at,
        )

        self._save_session_to_disk(session_id)

        return metadata

    def reset_to_original(self, session_id: str) -> dict:
        """
        Reset current.csv back to original.csv.
        Returns updated metadata.
        """
        if not self.session_has_file(session_id):
            raise ValueError(f"Session {session_id} has no file")

        session_dir = self.get_session_dir(session_id)
        original_path = session_dir / "original.csv"
        current_path = session_dir / "current.csv"

        # Copy original to current
        current_path.write_bytes(original_path.read_bytes())

        # Reload and return metadata
        df = pd.read_csv(current_path)

        metadata = {
            "row_count": len(df),
            "column_count": len(df.columns),
            "columns": df.columns.tolist(),
            "preview": _sanitize_preview(df),
        }

        # Update session
        session = self._sessions[session_id]
        self._sessions[session_id] = SessionInfo(
            session_id=session.session_id,
            has_file=True,
            filename=session.filename,
            row_count=metadata["row_count"],
            column_count=metadata["column_count"],
            columns=metadata["columns"],
            created_at=session.created_at,
        )

        self._save_session_to_disk(session_id)

        return metadata

    # ============ Chat History Persistence ============

    def add_chat_message(
        self,
        session_id: str,
        role: str,
        text: str,
        message_type: str = "text",
        plot_path: Optional[str] = None,
        plot_title: Optional[str] = None,
        plot_data: Optional[dict] = None,
    ) -> dict:
        """
        Add a message to chat history.

        Args:
            session_id: The session ID
            role: "user" or "assistant" or "system"
            text: Message text
            message_type: "text", "plot", "error", etc.
            plot_path: Optional path to plot image (for plot messages)
            plot_title: Optional plot title (for plot messages)
            plot_data: Optional plot data with chart_config and chart_data

        Returns:
            The saved message dict with id and timestamp
        """
        session_dir = self.get_session_dir(session_id)
        session_dir.mkdir(parents=True, exist_ok=True)
        history_file = session_dir / "chat_history.json"

        # Load existing history
        history = []
        if history_file.exists():
            try:
                history = json.loads(history_file.read_text(encoding="utf-8"))
            except Exception:
                history = []

        # Create message
        message = {
            "id": len(history) + 1,
            "role": role,
            "text": text,
            "type": message_type,
            "timestamp": datetime.now().isoformat(),
        }

        # Add plot info if provided
        if plot_path:
            message["plot_path"] = plot_path
        if plot_title:
            message["plot_title"] = plot_title
        if plot_data:
            message["plot_data"] = plot_data

        history.append(message)

        # Save (use safe encoder to handle NaN/numpy types in plot_data)
        history_file.write_text(_safe_json_dumps(history, indent=2, ensure_ascii=False), encoding="utf-8")

        return message

    def get_chat_history(self, session_id: str) -> list[dict]:
        """Get all chat messages for a session."""
        session_dir = self.get_session_dir(session_id)
        history_file = session_dir / "chat_history.json"

        if history_file.exists():
            try:
                return json.loads(history_file.read_text(encoding="utf-8"))
            except Exception:
                return []
        return []

    def clear_chat_history(self, session_id: str):
        """Clear chat history for a session."""
        session_dir = self.get_session_dir(session_id)
        history_file = session_dir / "chat_history.json"
        if history_file.exists():
            history_file.unlink()

    # ============ Plots Persistence ============

    def add_plot(self, session_id: str, plot_data: dict) -> dict:
        """
        Add a plot to session.

        Args:
            session_id: The session ID
            plot_data: Plot info dict (id, title, columns_used, summary, chart_data, etc.)

        Returns:
            The saved plot dict with timestamp
        """
        session_dir = self.get_session_dir(session_id)
        session_dir.mkdir(parents=True, exist_ok=True)
        plots_file = session_dir / "plots.json"

        # Load existing plots
        plots = []
        if plots_file.exists():
            try:
                plots = json.loads(plots_file.read_text(encoding="utf-8"))
            except Exception:
                plots = []

        # Add timestamp
        plot_data["timestamp"] = datetime.now().isoformat()

        plots.append(plot_data)

        # Save (use safe encoder to handle NaN/numpy types in chart data)
        plots_file.write_text(_safe_json_dumps(plots, indent=2, ensure_ascii=False), encoding="utf-8")

        return plot_data

    def get_plots(self, session_id: str) -> list[dict]:
        """Get all plots for a session."""
        session_dir = self.get_session_dir(session_id)
        plots_file = session_dir / "plots.json"

        if plots_file.exists():
            try:
                return json.loads(plots_file.read_text(encoding="utf-8"))
            except Exception:
                return []
        return []

    def clear_plots(self, session_id: str):
        """Clear plots for a session."""
        session_dir = self.get_session_dir(session_id)
        plots_file = session_dir / "plots.json"
        if plots_file.exists():
            plots_file.unlink()

    # ============ Query History Persistence ============

    def add_query(
        self,
        session_id: str,
        intent: str,
        code: str,
        success: bool,
        result_type: str,
        result_preview: Optional[str] = None,
        error: Optional[str] = None,
    ) -> dict:
        """
        Save an executed query for audit/debug purposes.

        Args:
            session_id: The session ID
            intent: What user wanted to do
            code: Generated pandas code
            success: Whether execution succeeded
            result_type: Type of result (dataframe, value, etc.)
            result_preview: Preview of the result
            error: Error message if failed

        Returns:
            The saved query dict with timestamp
        """
        session_dir = self.get_session_dir(session_id)
        session_dir.mkdir(parents=True, exist_ok=True)
        queries_file = session_dir / "queries.json"

        # Load existing queries
        queries = []
        if queries_file.exists():
            try:
                queries = json.loads(queries_file.read_text(encoding="utf-8"))
            except Exception:
                queries = []

        # Create query record
        query_record = {
            "id": len(queries) + 1,
            "intent": intent,
            "code": code,
            "success": success,
            "result_type": result_type,
            "result_preview": result_preview,
            "error": error,
            "timestamp": datetime.now().isoformat(),
        }

        queries.append(query_record)

        # Save (keep last 100 queries to avoid file bloat)
        if len(queries) > 100:
            queries = queries[-100:]

        queries_file.write_text(json.dumps(queries, indent=2, ensure_ascii=False), encoding="utf-8")

        return query_record

    def get_queries(self, session_id: str, limit: int = 50) -> list[dict]:
        """Get query history for a session."""
        session_dir = self.get_session_dir(session_id)
        queries_file = session_dir / "queries.json"

        if queries_file.exists():
            try:
                queries = json.loads(queries_file.read_text(encoding="utf-8"))
                return queries[-limit:]  # Return last N queries
            except Exception:
                return []
        return []

    # ============ Data Summary Caching ============

    def save_data_summary(self, session_id: str, summary: str, version: str = "current"):
        """
        Cache data summary to avoid regenerating it.

        Args:
            session_id: The session ID
            summary: The generated data summary text
            version: "current" or "original"
        """
        session_dir = self.get_session_dir(session_id)
        session_dir.mkdir(parents=True, exist_ok=True)
        cache_file = session_dir / f"summary_{version}.txt"
        cache_file.write_text(summary, encoding="utf-8")

    def get_data_summary(self, session_id: str, version: str = "current") -> Optional[str]:
        """
        Get cached data summary if available.

        Args:
            session_id: The session ID
            version: "current" or "original"

        Returns:
            Cached summary or None if not cached
        """
        session_dir = self.get_session_dir(session_id)
        cache_file = session_dir / f"summary_{version}.txt"

        if cache_file.exists():
            try:
                return cache_file.read_text(encoding="utf-8")
            except Exception:
                return None
        return None

    def invalidate_data_summary(self, session_id: str, version: str = "current"):
        """
        Invalidate cached summary (call after data transformation).

        Args:
            session_id: The session ID
            version: "current" or "original" or "all"
        """
        session_dir = self.get_session_dir(session_id)

        if version == "all":
            for v in ["current", "original"]:
                cache_file = session_dir / f"summary_{v}.txt"
                if cache_file.exists():
                    cache_file.unlink()
        else:
            cache_file = session_dir / f"summary_{version}.txt"
            if cache_file.exists():
                cache_file.unlink()


# Singleton instance
_session_manager: Optional[SessionManager] = None


def get_session_manager() -> SessionManager:
    """Get or create the session manager singleton."""
    global _session_manager
    if _session_manager is None:
        from backend.config import get_settings
        settings = get_settings()
        _session_manager = SessionManager(settings.data_dir)
    return _session_manager
