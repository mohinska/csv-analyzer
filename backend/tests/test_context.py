"""Tests for context building and prompt selection."""

import json

import pytest

from backend.app.agent.context import build_messages_for_llm, build_data_summary, get_system_prompt


class TestBuildDataSummary:
    def test_format_includes_table_name(self):
        summary = build_data_summary(
            row_count=100,
            col_count=3,
            column_types={"id": "INTEGER", "name": "VARCHAR", "score": "DOUBLE"},
        )
        assert "Table: `data`" in summary

    def test_format_includes_row_count(self):
        summary = build_data_summary(
            row_count=15234,
            col_count=2,
            column_types={"a": "INTEGER", "b": "VARCHAR"},
        )
        assert "15234" in summary or "15,234" in summary

    def test_format_includes_all_columns(self):
        column_types = {"id": "INTEGER", "name": "VARCHAR", "score": "DOUBLE"}
        summary = build_data_summary(
            row_count=10,
            col_count=3,
            column_types=column_types,
        )
        for col_name, col_type in column_types.items():
            assert col_name in summary
            assert col_type in summary


class TestGetSystemPrompt:
    def test_selects_prompt1_for_auto_analyze(self):
        prompt = get_system_prompt(is_initial_analysis=True, data_summary="## Dataset\n...")
        # Prompt 1 should mention initial analysis concepts
        assert "initial analysis" in prompt.lower() or "uploaded" in prompt.lower()
        assert "## Dataset" in prompt

    def test_selects_prompt2_for_user_message(self):
        prompt = get_system_prompt(is_initial_analysis=False, data_summary="## Dataset\n...")
        # Prompt 2 should mention user questions / conversation
        assert "question" in prompt.lower() or "conversation" in prompt.lower()
        assert "## Dataset" in prompt

    def test_data_summary_injected_into_prompt(self):
        summary = "## Dataset\nTable: `data`\nRows: 500\nColumns (3):\n  - id: INTEGER"
        prompt = get_system_prompt(is_initial_analysis=True, data_summary=summary)
        assert "Table: `data`" in prompt
        assert "Rows: 500" in prompt


class TestBuildMessagesForLLM:
    def test_includes_user_messages(self):
        db_messages = [
            {"role": "user", "type": "text", "text": "What is the average score?"},
        ]
        result = build_messages_for_llm(db_messages)
        user_msgs = [m for m in result if m["role"] == "user"]
        assert len(user_msgs) == 1
        assert user_msgs[0]["content"] == "What is the average score?"

    def test_includes_assistant_text_messages(self):
        db_messages = [
            {"role": "user", "type": "text", "text": "Hello"},
            {"role": "assistant", "type": "text", "text": "The average score is 85."},
        ]
        result = build_messages_for_llm(db_messages)
        assistant_msgs = [m for m in result if m["role"] == "assistant"]
        assert len(assistant_msgs) == 1

    def test_excludes_reasoning_from_context(self):
        db_messages = [
            {"role": "user", "type": "text", "text": "Hello"},
            {"role": "assistant", "type": "reasoning", "text": "I should query the averages first."},
            {"role": "assistant", "type": "text", "text": "The average is 85."},
        ]
        result = build_messages_for_llm(db_messages)
        # Reasoning should NOT be replayed in cross-turn context
        all_text = " ".join(
            m["content"] if isinstance(m["content"], str) else str(m["content"])
            for m in result if m["role"] == "assistant"
        )
        assert "query the averages" not in all_text
        # But assistant text should still be present
        assert "average is 85" in all_text

    def test_includes_query_result_messages(self):
        db_messages = [
            {"role": "user", "type": "text", "text": "Show averages"},
            {
                "role": "assistant",
                "type": "query_result",
                "text": "Average scores by group",
                "plot_data": '{"query": "SELECT AVG(score) FROM data", "columns": ["avg"], "rows": [[85.0]]}',
            },
        ]
        result = build_messages_for_llm(db_messages)
        # Query results should appear in context so agent knows what it already queried
        all_text = str(result)
        assert "AVG(score)" in all_text or "85.0" in all_text

    def test_preserves_message_order(self):
        db_messages = [
            {"role": "user", "type": "text", "text": "first"},
            {"role": "assistant", "type": "reasoning", "text": "thinking"},
            {"role": "assistant", "type": "text", "text": "response"},
            {"role": "user", "type": "text", "text": "second"},
        ]
        result = build_messages_for_llm(db_messages)
        roles = [m["role"] for m in result]
        # Reasoning is excluded, so only user-assistant-user
        assert roles == ["user", "assistant", "user"]

    def test_query_result_truncated_to_max_context_rows(self):
        rows = [[i, i * 10] for i in range(50)]
        db_messages = [
            {"role": "user", "type": "text", "text": "Show data"},
            {
                "role": "assistant",
                "type": "query_result",
                "text": "All rows",
                "plot_data": json.dumps({
                    "query": "SELECT * FROM data",
                    "columns": ["id", "value"],
                    "rows": rows,
                }),
            },
        ]
        result = build_messages_for_llm(db_messages)
        assistant_msg = [m for m in result if m["role"] == "assistant"][0]
        # Should only contain up to MAX_CONTEXT_ROWS (5) rows of data
        assert "50 rows" in assistant_msg["content"]
        assert "columns" in assistant_msg["content"]
        # Count actual data rows in the JSON portion
        import re
        # The truncated preview should have 5 rows
        content = assistant_msg["content"]
        json_part = content.split("\n")[-1]
        parsed_rows = json.loads(json_part)
        assert len(parsed_rows) == 5
