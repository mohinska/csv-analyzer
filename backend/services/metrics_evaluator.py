"""
MetricsEvaluator - evaluates quality metrics after each tool execution.

Metrics evaluated at runtime (inside the planner loop):
1. valid_answer   - Did the query execute, produce non-empty result of correct type?
2. hallucination  - Do numbers in LLM text actually exist in the query result?
3. unsafe_code    - Does generated code contain forbidden patterns?

These metrics are appended to tool results so the planner LLM can decide
whether to retry or proceed.
"""
import re
from dataclasses import dataclass, field
from typing import Any, Optional

import numpy as np
import pandas as pd


@dataclass
class MetricResult:
    """Result of a single metric check."""
    name: str
    passed: bool
    score: float  # 0.0 to 1.0
    detail: str


@dataclass
class MetricsReport:
    """Aggregated metrics for one tool execution."""
    metrics: list[MetricResult] = field(default_factory=list)

    @property
    def all_passed(self) -> bool:
        return all(m.passed for m in self.metrics)

    @property
    def should_retry(self) -> bool:
        """True if any critical metric failed and a retry could help.
        Note: hallucination is informational only — it should NOT trigger retries
        because derived/calculated numbers (totals, averages, row counts) are
        legitimate even if they don't appear verbatim in the query result preview.
        """
        for m in self.metrics:
            if not m.passed and m.name == "valid_answer":
                return True
        return False

    def to_feedback(self) -> str:
        """Format metrics as feedback text for the LLM."""
        if not self.metrics:
            return ""

        lines = ["\nQUALITY METRICS:"]
        for m in self.metrics:
            status = "PASS" if m.passed else "FAIL"
            lines.append(f"  - {m.name}: {status} ({m.detail})")

        if self.should_retry:
            lines.append("  >> RECOMMENDATION: Retry with a different approach.")

        return "\n".join(lines)

    def to_dict(self) -> dict:
        """Serialize for logging / frontend."""
        return {
            "all_passed": self.all_passed,
            "should_retry": self.should_retry,
            "metrics": [
                {"name": m.name, "passed": m.passed, "score": m.score, "detail": m.detail}
                for m in self.metrics
            ],
        }


class MetricsEvaluator:
    """
    Evaluates quality metrics after tool executions.

    Usage:
        evaluator = MetricsEvaluator()

        # After generate_query:
        report = evaluator.evaluate_query_result(result, intent)

        # After write_to_chat:
        report = evaluator.evaluate_chat_text(text, last_query_result)

        # After code generation (before execution):
        report = evaluator.evaluate_code_safety(code)
    """

    # SQL patterns that indicate unsafe operations
    UNSAFE_PATTERNS = [
        (r'\bDROP\b', "uses DROP statement"),
        (r'\bDELETE\b', "uses DELETE statement"),
        (r'\bINSERT\b', "uses INSERT statement"),
        (r'\bUPDATE\b', "uses UPDATE statement"),
        (r'\bALTER\b', "uses ALTER statement"),
        (r'\bCREATE\b', "uses CREATE statement"),
        (r'\bTRUNCATE\b', "uses TRUNCATE statement"),
        (r'\bGRANT\b', "uses GRANT statement"),
        (r'\bREVOKE\b', "uses REVOKE statement"),
        (r'\bCOPY\b', "uses COPY statement"),
        (r'\bMERGE\b', "uses MERGE statement"),
    ]

    def evaluate_query_result(
        self,
        success: bool,
        result: Any,
        result_type: str,
        result_preview: Optional[str],
        error: Optional[str],
        intent: str,
    ) -> MetricsReport:
        """
        Evaluate valid_answer metric after a query execution.

        Checks:
        - Query executed without error
        - Result is not empty
        - Result type is reasonable for the intent
        """
        report = MetricsReport()

        # --- Check 1: Execution success ---
        if not success:
            report.metrics.append(MetricResult(
                name="valid_answer",
                passed=False,
                score=0.0,
                detail=f"query failed with error",
            ))
            return report

        # --- Check 2: Non-empty result ---
        is_empty = False
        empty_reason = ""

        if result is None:
            is_empty = True
            empty_reason = "result is None"
        elif isinstance(result, pd.DataFrame) and len(result) == 0:
            is_empty = True
            empty_reason = "DataFrame has 0 rows"
        elif isinstance(result, pd.Series) and len(result) == 0:
            is_empty = True
            empty_reason = "Series is empty"
        elif result_type == "none":
            is_empty = True
            empty_reason = "no return value from code"

        if is_empty:
            report.metrics.append(MetricResult(
                name="valid_answer",
                passed=False,
                score=0.2,
                detail=empty_reason,
            ))
            return report

        # --- Check 3: Result has meaningful content ---
        score = 1.0
        detail_parts = []

        if isinstance(result, pd.DataFrame):
            rows = len(result)
            cols = len(result.columns)
            detail_parts.append(f"{rows} rows x {cols} cols")
            # Penalize if all values are NaN
            if result.isna().all().all():
                score = 0.3
                detail_parts.append("all values are NaN")
        elif isinstance(result, pd.Series):
            detail_parts.append(f"{len(result)} items")
            if result.isna().all():
                score = 0.3
                detail_parts.append("all values are NaN")
        elif isinstance(result, (int, float, np.integer, np.floating)):
            if np.isnan(result) if isinstance(result, (float, np.floating)) else False:
                score = 0.3
                detail_parts.append("result is NaN")
            else:
                detail_parts.append(f"value={result}")
        else:
            detail_parts.append(f"type={result_type}")

        report.metrics.append(MetricResult(
            name="valid_answer",
            passed=score >= 0.5,
            score=score,
            detail=", ".join(detail_parts),
        ))

        return report

    def evaluate_chat_text(
        self,
        text: str,
        last_query_result: Optional[str],
    ) -> MetricsReport:
        """
        Evaluate hallucination metric for LLM-generated text.

        MVP approach: extract all numbers from text and check if they
        appear in the query result preview.
        """
        report = MetricsReport()

        if not last_query_result or not text:
            # No query result to compare against — skip
            report.metrics.append(MetricResult(
                name="hallucination",
                passed=True,
                score=1.0,
                detail="no query result to compare (skipped)",
            ))
            return report

        # Extract numbers from LLM text (integers and decimals)
        # Skip small integers (≤20) as they're often row/column counts or ordinals
        text_numbers = set()
        for match in re.finditer(r'(?<!\w)(\d+\.?\d*)', text):
            num_str = match.group(1)
            try:
                val = float(num_str)
                if '.' in num_str or val > 20:
                    text_numbers.add(num_str)
            except ValueError:
                continue

        if not text_numbers:
            report.metrics.append(MetricResult(
                name="hallucination",
                passed=True,
                score=1.0,
                detail="no significant numbers in text",
            ))
            return report

        # Check which numbers exist in the query result
        found = 0
        not_found = []
        for num_str in text_numbers:
            if num_str in last_query_result:
                found += 1
            else:
                # Try rounded versions
                try:
                    val = float(num_str)
                    # Check if a rounded version appears
                    found_rounded = False
                    for decimals in range(3):
                        rounded = f"{val:.{decimals}f}"
                        if rounded in last_query_result:
                            found_rounded = True
                            break
                        # Also try with comma formatting
                        rounded_comma = f"{val:,.{decimals}f}"
                        if rounded_comma in last_query_result:
                            found_rounded = True
                            break
                    if found_rounded:
                        found += 1
                    else:
                        not_found.append(num_str)
                except ValueError:
                    not_found.append(num_str)

        total = len(text_numbers)
        score = found / total if total > 0 else 1.0
        passed = score >= 0.3  # Lenient: many numbers are derived (totals, averages, counts)

        detail = f"{found}/{total} numbers verified"
        if not_found:
            detail += f", unverified: {', '.join(not_found[:5])}"

        report.metrics.append(MetricResult(
            name="hallucination",
            passed=passed,
            score=score,
            detail=detail,
        ))

        return report

    def evaluate_code_safety(self, code: str) -> MetricsReport:
        """
        Evaluate unsafe_code metric on generated SQL.

        Checks for forbidden SQL statement types (DDL/DML).
        """
        report = MetricsReport()
        violations = []

        for pattern, description in self.UNSAFE_PATTERNS:
            if re.search(pattern, code, re.IGNORECASE):
                violations.append(description)

        if violations:
            report.metrics.append(MetricResult(
                name="unsafe_code",
                passed=False,
                score=0.0,
                detail=f"violations: {', '.join(violations)}",
            ))
        else:
            report.metrics.append(MetricResult(
                name="unsafe_code",
                passed=True,
                score=1.0,
                detail="no forbidden patterns detected",
            ))

        return report


# Singleton
_evaluator: Optional[MetricsEvaluator] = None


def get_metrics_evaluator() -> MetricsEvaluator:
    global _evaluator
    if _evaluator is None:
        _evaluator = MetricsEvaluator()
    return _evaluator
