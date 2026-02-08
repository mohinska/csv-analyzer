"""
Query Executor - safely executes generated pandas code.
"""
import io
import sys
import builtins
import traceback
from typing import Any, Optional
from dataclasses import dataclass
import pandas as pd
import numpy as np
import matplotlib
matplotlib.use('Agg')  # Non-interactive backend
import matplotlib.pyplot as plt
import seaborn as sns
import scipy
import scipy.stats


@dataclass
class ExecutionResult:
    """Result of code execution."""
    success: bool
    result: Any = None  # The actual result (DataFrame, value, etc.)
    result_type: str = "unknown"  # "dataframe", "value", "figure", "none"
    result_preview: Optional[str] = None  # String representation
    error: Optional[str] = None
    stdout: Optional[str] = None


class QueryExecutor:
    """
    Safely executes pandas code in a restricted environment.
    """

    # Allowed modules in the execution namespace
    ALLOWED_MODULES = {
        'pd': pd,
        'np': np,
        'pandas': pd,
        'numpy': np,
        'plt': plt,
        'matplotlib': matplotlib,
        'sns': sns,
        'seaborn': sns,
        'scipy': scipy,
        'stats': scipy.stats,
    }

    def execute(self, code: str, df: pd.DataFrame) -> ExecutionResult:
        """
        Execute pandas code against a DataFrame.

        Args:
            code: Python/pandas code to execute
            df: The DataFrame to operate on

        Returns:
            ExecutionResult with success status and result
        """
        # Close any existing figures to prevent leaks
        plt.close('all')

        # Create namespace with everything (single dict for both globals and locals)
        namespace = {
            'df': df.copy(),  # Work on a copy to avoid side effects
            **self.ALLOWED_MODULES,
            '__builtins__': self._get_safe_builtins(),
        }

        # Capture stdout
        old_stdout = sys.stdout
        sys.stdout = captured_output = io.StringIO()

        try:
            # Execute the code with single namespace dict
            exec(code, namespace, namespace)

            stdout = captured_output.getvalue()

            # Check for result variable
            if 'result' in namespace:
                result = namespace['result']
                return self._create_result(result, stdout)

            # Check if df was modified
            if 'df' in namespace:
                new_df = namespace['df']
                if not new_df.equals(df):
                    return self._create_result(new_df, stdout, is_transformation=True)

            # Check for figure
            if 'fig' in namespace:
                return ExecutionResult(
                    success=True,
                    result=namespace['fig'],
                    result_type="figure",
                    stdout=stdout,
                )

            # No explicit result
            return ExecutionResult(
                success=True,
                result=None,
                result_type="none",
                result_preview="Code executed successfully (no return value)",
                stdout=stdout,
            )

        except Exception as e:
            error_msg = f"{type(e).__name__}: {str(e)}\n{traceback.format_exc()}"
            return ExecutionResult(
                success=False,
                error=error_msg,
                stdout=captured_output.getvalue(),
            )

        finally:
            sys.stdout = old_stdout

    def _create_result(
        self,
        result: Any,
        stdout: str,
        is_transformation: bool = False
    ) -> ExecutionResult:
        """Create ExecutionResult from a result value."""
        if isinstance(result, pd.DataFrame):
            return ExecutionResult(
                success=True,
                result=result,
                result_type="dataframe" if is_transformation else "dataframe_query",
                result_preview=f"DataFrame with {len(result)} rows, {len(result.columns)} columns\n{result.head(10).to_string()}",
                stdout=stdout,
            )
        elif isinstance(result, pd.Series):
            return ExecutionResult(
                success=True,
                result=result,
                result_type="series",
                result_preview=f"Series with {len(result)} items\n{result.head(10).to_string()}",
                stdout=stdout,
            )
        elif isinstance(result, (int, float, np.integer, np.floating)):
            return ExecutionResult(
                success=True,
                result=result,
                result_type="value",
                result_preview=str(result),
                stdout=stdout,
            )
        elif isinstance(result, (list, dict)):
            import json
            return ExecutionResult(
                success=True,
                result=result,
                result_type="collection",
                result_preview=json.dumps(result, default=str, indent=2)[:1000],
                stdout=stdout,
            )
        else:
            return ExecutionResult(
                success=True,
                result=result,
                result_type=type(result).__name__,
                result_preview=str(result)[:1000],
                stdout=stdout,
            )

    def _get_safe_builtins(self) -> dict:
        """Return a restricted set of builtins based on the real builtins module."""
        # Safe import function that only allows whitelisted modules
        def safe_import(name, globals=None, locals=None, fromlist=(), level=0):
            allowed = {
                'matplotlib': matplotlib,
                'matplotlib.pyplot': plt,
                'seaborn': sns,
                'pandas': pd,
                'numpy': np,
                'scipy': scipy,
                'scipy.stats': scipy.stats,
            }
            if name in allowed:
                return allowed[name]
            # Handle "from X import Y" style
            if name == 'matplotlib' and fromlist:
                if 'pyplot' in fromlist:
                    return matplotlib
            if name == 'scipy' and fromlist:
                if 'stats' in fromlist:
                    return scipy
            raise ImportError(f"Import of '{name}' is not allowed")

        # Start with safe subset of real builtins
        safe_names = [
            'True', 'False', 'None',
            'abs', 'all', 'any', 'bool', 'dict', 'enumerate', 'filter',
            'float', 'int', 'len', 'list', 'map', 'max', 'min', 'print',
            'range', 'round', 'set', 'sorted', 'str', 'sum', 'tuple', 'zip',
            'isinstance', 'type', 'getattr', 'setattr', 'hasattr',
            'repr', 'slice', 'reversed', 'iter', 'next',
            'object', 'property', 'staticmethod', 'classmethod',
            'super', 'callable', 'format', 'chr', 'ord', 'hex', 'oct', 'bin',
            'pow', 'divmod', 'hash', 'id', 'ascii', 'bytes', 'bytearray',
            'memoryview', 'frozenset', 'complex',
            'Exception', 'ValueError', 'TypeError', 'KeyError', 'IndexError',
            'AttributeError', 'RuntimeError', 'StopIteration',
        ]

        safe = {}
        for name in safe_names:
            if hasattr(builtins, name):
                safe[name] = getattr(builtins, name)

        # Override __import__ with our safe version
        safe['__import__'] = safe_import

        return safe


# Singleton instance
_executor: Optional[QueryExecutor] = None


def get_query_executor() -> QueryExecutor:
    """Get or create the query executor singleton."""
    global _executor
    if _executor is None:
        _executor = QueryExecutor()
    return _executor
