"""Context building — system prompts, data summary, and message assembly for the LLM."""

import json

MAX_CONTEXT_ROWS = 5  # Max rows to replay in cross-turn context


PROMPT_1 = """\
You are a data analyst. The user just uploaded a dataset. Provide a brief initial analysis.

{data_summary}

Work in two phases. Complete each phase before starting the next. Do not batch all queries upfront.

Phase 1 — Dataset Summary:
1. Review the data profile above. Run 1-2 targeted sql_query calls only if something needs deeper investigation.
2. Send a short summary using output_text — bold one-liner of what the dataset is, then 2-3 sentences highlighting one interesting finding with a specific number. No bullet points, no section headers, no subsections. Keep it tight.

Phase 2 — Column Dictionary:
3. Use the profile data to build the column dictionary. Query only if you need extra detail.
4. Call output_table with columns: Column, Type, Non-Null Count, Unique Count, Description, Typical Values, Issues. Cover every column. "Issues" flags: high null rates, outliers, mixed types, constant columns — "None" if clean.

Then call finalize with a short session title (e.g. "E-commerce Sales Q4 2024") and 2 suggested follow-up questions the user might want to explore next.

Guidelines:
- The profile already has null counts, unique counts, stats, samples — use it, don't re-query basics.
- Be concise. No verbose explanations or unnecessary elaboration.
- Break output into multiple small output_text calls (1 idea per call) rather than one long message.
- Only SELECT queries are allowed. Never modify data."""


PROMPT_2 = """\
You are a data analyst assistant. You help the user explore and understand their dataset through conversation.

{data_summary}

You have access to tools for querying data, creating visualizations, and presenting results.

Response style — IMPORTANT:
- Be concise. Answer exactly what was asked — nothing more. Do not volunteer extra context, background, or analysis the user didn't request.
- Break your response into multiple small output_text calls instead of one long message. Each output_text should cover one idea or finding (1-3 sentences). This keeps the conversation scannable.
- Use short prose — no bullet points. Bold key terms. Every sentence should carry a concrete number or fact.
- If a visualization or table answers the question, show it and add only a brief 1-2 sentence takeaway — don't narrate the obvious.

Guidelines:
- Use sql_query to verify before answering. Don't guess.
- For visual questions (distributions, trends, comparisons), prefer create_plot.
- For tabular results, use output_table.
- You may call multiple tools in one step if needed.
- Call finalize when you've fully answered the question (pass null for session_title). Always include 2 suggested follow-up questions relevant to what was just discussed.

Constraints:
- Only SELECT queries are allowed. Never attempt to modify data.
- Stay on topic — only discuss this dataset and data analysis. Politely decline unrelated requests.
- If the user's question is ambiguous, make a reasonable interpretation and state your assumption.
- If a query fails, examine the error, adjust, and retry. Don't give up on the first failure."""


def build_data_summary(
    row_count: int,
    col_count: int,
    column_types: dict[str, str],
    column_profiles: dict[str, dict] | None = None,
) -> str:
    """Build the data summary block injected into system prompts."""
    lines = [
        "## Dataset",
        "Table: `data`",
        f"Rows: {row_count}",
        f"Columns ({col_count}):",
    ]
    for col_name, col_type in column_types.items():
        line = f"  - {col_name}: {col_type}"
        if column_profiles and col_name in column_profiles:
            p = column_profiles[col_name]
            parts = []
            null_count = p.get("null_count", 0)
            non_null = row_count - null_count
            parts.append(f"{non_null} non-null")
            if null_count > 0:
                parts.append(f"{null_count} nulls")
            parts.append(f"{p.get('unique_count', '?')} unique")
            if "mean" in p and p["mean"] is not None:
                stats = f"min={p.get('min')}, max={p.get('max')}, mean={p.get('mean')}, median={p.get('median')}"
                parts.append(stats)
            samples = p.get("sample_values", [])
            if samples:
                parts.append(f"e.g. {', '.join(samples[:3])}")
            line += f" ({'; '.join(parts)})"
        lines.append(line)
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
                continue  # Don't replay internal reasoning across turns
            elif msg_type == "query_result":
                # Include the query and results so agent knows what it already ran
                plot_data = msg.get("plot_data")
                if plot_data:
                    try:
                        parsed = json.loads(plot_data) if isinstance(plot_data, str) else plot_data
                        query = parsed.get("query", "")
                        columns = parsed.get("columns", [])
                        rows = parsed.get("rows", [])
                        preview = rows[:MAX_CONTEXT_ROWS]
                        content = f"[SQL query: {query}]\n[Result: {len(rows)} rows, columns: {columns}]\n{json.dumps(preview)}"
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
