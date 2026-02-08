"""
Query Executor - executes SQL queries against DataFrames using DuckDB.

Replaces the previous exec()-based approach with declarative SQL,
which is safer (no arbitrary code execution) and more reliable
(LLMs generate SQL well).
"""
import re
import traceback
from typing import Any, Optional
from dataclasses import dataclass
import pandas as pd
import numpy as np
import duckdb


@dataclass
class ExecutionResult:
    """Result of code execution."""
    success: bool
    result: Any = None  # The actual result (DataFrame, value, etc.)
    result_type: str = "unknown"  # "dataframe", "value", "none"
    result_preview: Optional[str] = None  # String representation
    error: Optional[str] = None
    stdout: Optional[str] = None


# SQL statement types that are NOT allowed
BLOCKED_STATEMENTS = re.compile(
    r'\b(DROP|DELETE|INSERT|UPDATE|ALTER|CREATE|TRUNCATE|REPLACE|MERGE|GRANT|REVOKE|COPY)\b',
    re.IGNORECASE,
)


class QueryExecutor:
    """
    Executes SQL queries against pandas DataFrames via DuckDB.

    The DataFrame is registered as a table named `df` so queries
    can reference it directly: SELECT * FROM df WHERE age > 30
    """

    def execute(self, code: str, df: pd.DataFrame) -> ExecutionResult:
        """
        Execute a SQL query against a DataFrame.

        Args:
            code: SQL query (SELECT/WITH only)
            df: The DataFrame to query

        Returns:
            ExecutionResult with success status and result
        """
        # Validate SQL safety
        violation = self._validate_sql(code)
        if violation:
            return ExecutionResult(
                success=False,
                error=f"SQL safety violation: {violation}",
            )

        conn = None
        try:
            conn = duckdb.connect()
            conn.register('df', df)

            result_df = conn.execute(code).fetchdf()

            # Determine result type
            is_scalar = len(result_df) == 1 and len(result_df.columns) == 1
            is_transformation = self._is_transformation(code, df, result_df)

            if is_scalar:
                # Single value result
                value = result_df.iloc[0, 0]
                # Convert numpy types to Python native
                if isinstance(value, (np.integer,)):
                    value = int(value)
                elif isinstance(value, (np.floating,)):
                    value = float(value)
                return ExecutionResult(
                    success=True,
                    result=value,
                    result_type="value",
                    result_preview=str(value),
                )
            elif is_transformation:
                # Data transformation — return the new DataFrame
                return ExecutionResult(
                    success=True,
                    result=result_df,
                    result_type="dataframe",
                    result_preview=(
                        f"DataFrame with {len(result_df)} rows, "
                        f"{len(result_df.columns)} columns\n"
                        f"{result_df.head(10).to_string()}"
                    ),
                )
            else:
                # Query result (aggregation, filter preview, etc.)
                return ExecutionResult(
                    success=True,
                    result=result_df,
                    result_type="dataframe_query",
                    result_preview=(
                        f"DataFrame with {len(result_df)} rows, "
                        f"{len(result_df.columns)} columns\n"
                        f"{result_df.head(10).to_string()}"
                    ),
                )

        except Exception as e:
            error_msg = f"{type(e).__name__}: {str(e)}\n{traceback.format_exc()}"
            return ExecutionResult(
                success=False,
                error=error_msg,
            )

        finally:
            if conn:
                conn.close()

    def _validate_sql(self, sql: str) -> Optional[str]:
        """
        Validate that SQL only contains safe statements (SELECT/WITH).
        Returns violation description or None if safe.
        """
        # Strip comments and normalize
        cleaned = re.sub(r'--.*$', '', sql, flags=re.MULTILINE)
        cleaned = re.sub(r'/\*.*?\*/', '', cleaned, flags=re.DOTALL)
        cleaned = cleaned.strip().rstrip(';').strip()

        if not cleaned:
            return "empty query"

        # Check for blocked statement types
        match = BLOCKED_STATEMENTS.search(cleaned)
        if match:
            return f"statement type '{match.group()}' is not allowed"

        # Must start with SELECT or WITH (after stripping)
        first_word = cleaned.split()[0].upper()
        if first_word not in ('SELECT', 'WITH'):
            return f"query must start with SELECT or WITH, got '{first_word}'"

        return None

    def _is_transformation(
        self, sql: str, original_df: pd.DataFrame, result_df: pd.DataFrame
    ) -> bool:
        """
        Detect if the query result represents a data transformation
        (i.e., the user wants to modify/replace the DataFrame).

        Heuristics:
        - Result has similar row count to original (within 50%)
        - Result has all original columns plus possibly new ones
        - SQL contains transformation hints (CASE WHEN, new column aliases)
        """
        sql_upper = sql.upper()

        # Explicit transformation patterns in SQL
        transform_hints = [
            'SELECT *' in sql_upper and 'AS ' in sql_upper,  # SELECT *, expr AS new_col
            'REPLACE(' in sql_upper,
            'COALESCE(' in sql_upper and 'SELECT *' in sql_upper,
            'CASE WHEN' in sql_upper and 'SELECT *' in sql_upper,
        ]
        if any(transform_hints):
            return True

        # If result has all original columns and similar row count, likely a transformation
        orig_cols = set(original_df.columns)
        result_cols = set(result_df.columns)

        has_all_original = orig_cols.issubset(result_cols)
        has_new_cols = len(result_cols) > len(orig_cols)
        similar_rows = (
            len(result_df) >= len(original_df) * 0.5
            and len(result_df) <= len(original_df) * 1.5
        )

        if has_all_original and has_new_cols and similar_rows:
            return True

        return False


# Singleton instance
_executor: Optional[QueryExecutor] = None


def get_query_executor() -> QueryExecutor:
    """Get or create the query executor singleton."""
    global _executor
    if _executor is None:
        _executor = QueryExecutor()
    return _executor
