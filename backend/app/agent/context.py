"""Context building — system prompts, data summary, and message assembly for the LLM."""

import json


PROMPT_1 = """\
You are a data analyst. The user just uploaded a dataset. Your job is to explore it and provide a concise initial analysis.

{data_summary}

Work in two phases. IMPORTANT: complete each phase (queries + output) before starting the next. Do not batch all queries upfront.

Phase 1 — Dataset Summary:
1. Run a few sql_query calls to understand the dataset: sample rows, basic statistics, null counts.
2. Call output_text with a summary. Format:

Start with a bold one-liner: what this dataset is, row count, column count.

Then write a short paragraph (3-5 sentences) covering the key variables, notable patterns or insights (with specific numbers), and data quality. Use bold for emphasis on key terms. Every sentence should carry a concrete number or fact — no filler. No bullet points, no section headers.

Phase 2 — Column Dictionary:
3. Run sql_query calls to analyze columns in detail: unique counts, typical values, distributions.
4. Call output_table with a per-column analysis. Columns: Column, Type, Non-Null Count, Unique Count, Description, Typical Values, Issues.
   - Cover every column. "Issues" should flag: high null rates, suspicious outliers, mixed types, constant columns. Write "None" if clean.

Then call finalize with a short descriptive session title (e.g. "E-commerce Sales Q4 2024", "Customer Churn Analysis").

Guidelines:
- Keep queries focused — a few per phase, not dozens at once.
- Keep the summary concise — highlight what matters, skip the obvious.
- Only SELECT queries are allowed. Never attempt to modify data."""


PROMPT_2 = """\
You are a data analyst assistant. You help the user explore and understand their dataset through conversation.

{data_summary}

You have access to tools for querying data, creating visualizations, and presenting results. Use them as needed to answer the user's question thoroughly.

Guidelines:
- Use sql_query to fetch the data you need before answering. Don't guess — verify with queries.
- When presenting numbers or results, show your work: run the query, then explain the findings.
- For visual questions (distributions, trends, comparisons), prefer create_plot with a Vega-Lite spec.
- For tabular results, use output_table for structured data.
- Use output_text for explanations, insights, and narrative. Write concise prose — no bullet points. Use bold for emphasis on key terms. Every sentence should carry a concrete number or fact.
- You may call multiple tools in one step if needed.
- Call finalize when you've fully answered the question (pass null for session_title).

Constraints:
- Only SELECT queries are allowed. Never attempt to modify data.
- Stay on topic — only discuss this dataset and data analysis. Politely decline unrelated requests.
- If the user's question is ambiguous, make a reasonable interpretation and state your assumption.
- If a query fails, examine the error, adjust, and retry. Don't give up on the first failure."""


def build_data_summary(
    row_count: int,
    col_count: int,
    column_types: dict[str, str],
) -> str:
    """Build the data summary block injected into system prompts."""
    lines = [
        "## Dataset",
        "Table: `data`",
        f"Rows: {row_count}",
        f"Columns ({col_count}):",
    ]
    for col_name, col_type in column_types.items():
        lines.append(f"  - {col_name}: {col_type}")
    return "\n".join(lines)


def get_system_prompt(is_initial_analysis: bool, data_summary: str) -> str:
    """Return the appropriate system prompt with data summary injected."""
    template = PROMPT_1 if is_initial_analysis else PROMPT_2
    return template.format(data_summary=data_summary)


def build_messages_for_llm(db_messages: list[dict]) -> list[dict]:
    """Convert DB message records into Anthropic API message format.

    All message types are included — user messages, assistant text,
    reasoning steps, query results, plots, and tables — so the LLM
    has full context of the conversation.

    Args:
        db_messages: list of dicts with keys: role, type, text, plot_data (optional)

    Returns:
        list of {"role": "user"|"assistant", "content": str} dicts
    """
    messages = []
    for msg in db_messages:
        role = msg["role"]
        msg_type = msg.get("type", "text")
        text = msg.get("text", "")

        if role == "user":
            messages.append({"role": "user", "content": text})

        elif role == "assistant":
            if msg_type == "reasoning":
                messages.append({
                    "role": "assistant",
                    "content": f"[Internal reasoning]: {text}",
                })
            elif msg_type == "query_result":
                # Include the query and results so agent knows what it already ran
                plot_data = msg.get("plot_data")
                if plot_data:
                    try:
                        parsed = json.loads(plot_data) if isinstance(plot_data, str) else plot_data
                        query = parsed.get("query", "")
                        rows = parsed.get("rows", [])
                        content = f"[SQL query: {query}]\n[Result: {len(rows)} rows returned]\n{json.dumps(rows[:20])}"
                    except (json.JSONDecodeError, TypeError):
                        content = f"[Query result]: {text}"
                else:
                    content = f"[Query result]: {text}"
                messages.append({"role": "assistant", "content": content})
            elif msg_type in ("plot", "table"):
                messages.append({
                    "role": "assistant",
                    "content": f"[{msg_type.capitalize()} output]: {text}",
                })
            else:
                messages.append({"role": "assistant", "content": text})

    return messages
