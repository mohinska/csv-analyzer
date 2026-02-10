"""Integration tests for the agent graph flow — mocked Anthropic API."""

import json
from unittest.mock import AsyncMock, patch, MagicMock

import pytest

from backend.app.agent.graph import run_agent


def make_tool_use_response(tool_calls, text_content=None):
    """Helper: build a mock Anthropic API response with tool_use blocks.

    Args:
        tool_calls: list of (tool_name, tool_input) tuples
        text_content: optional reasoning text before tool calls
    """
    content = []
    if text_content:
        content.append({"type": "text", "text": text_content})
    for name, inp in tool_calls:
        content.append({
            "type": "tool_use",
            "id": f"call_{name}",
            "name": name,
            "input": inp,
        })

    response = MagicMock()
    response.content = content
    response.stop_reason = "tool_use"
    return response


def make_text_response(text):
    """Helper: build a mock Anthropic API response with text only (no tools)."""
    response = MagicMock()
    response.content = [{"type": "text", "text": text}]
    response.stop_reason = "end_turn"
    return response


class TestAutoAnalyzeFlow:
    """Full auto_analyze: prompt1 → sql_query → output_text → output_table → finalize with title."""

    @pytest.mark.asyncio
    async def test_auto_analyze_full_flow(
        self, db, sample_session, sample_csv, mock_send_event, collected_events
    ):
        # Step 1: Agent explores data with sql_query
        response_1 = make_tool_use_response(
            text_content="Let me explore the data first.",
            tool_calls=[
                ("sql_query", {"query": "SELECT COUNT(*) as cnt FROM data", "description": "Row count"}),
            ],
        )
        # Step 2: Agent outputs analysis
        response_2 = make_tool_use_response(
            text_content="Now I'll present my findings.",
            tool_calls=[
                ("output_text", {"text": "This dataset contains 5 records of people with scores."}),
                ("output_table", {
                    "title": "Column Analysis",
                    "headers": ["Column", "Type", "Issues"],
                    "rows": [
                        ["id", "INTEGER", "None"],
                        ["name", "VARCHAR", "None"],
                        ["age", "INTEGER", "None"],
                        ["score", "DOUBLE", "1 null value"],
                    ],
                }),
            ],
        )
        # Step 3: Agent finalizes
        response_3 = make_tool_use_response(
            tool_calls=[
                ("finalize", {"session_title": "People Scores Dataset"}),
            ],
        )

        mock_responses = [response_1, response_2, response_3]
        call_count = 0

        async def mock_create(*args, **kwargs):
            nonlocal call_count
            resp = mock_responses[call_count]
            call_count += 1
            return resp

        with patch("backend.app.agent.graph.call_llm_streaming", side_effect=mock_create):
            await run_agent(
                session_id=sample_session.id,
                file_path=sample_csv,
                is_initial_analysis=True,
                send_event=mock_send_event,
                db=db,
            )

        event_types = [e["event"] for e in collected_events]

        # Should have: status (for queries), text, table, session_update, done
        assert "status" in event_types
        assert "text" in event_types
        assert "table" in event_types
        assert "session_update" in event_types
        assert "done" in event_types

        # Done should be last
        assert event_types[-1] == "done"


class TestUserMessageFlow:
    """User question: prompt2 → sql_query → output_text → finalize without title."""

    @pytest.mark.asyncio
    async def test_user_message_flow(
        self, db, sample_session, sample_csv, mock_send_event, collected_events
    ):
        response_1 = make_tool_use_response(
            text_content="I need to query the average score.",
            tool_calls=[
                ("sql_query", {"query": "SELECT AVG(score) as avg_score FROM data", "description": "Average score"}),
            ],
        )
        response_2 = make_tool_use_response(
            tool_calls=[
                ("output_text", {"text": "The average score is 87.7."}),
                ("finalize", {"session_title": None}),
            ],
        )

        mock_responses = [response_1, response_2]
        call_count = 0

        async def mock_create(*args, **kwargs):
            nonlocal call_count
            resp = mock_responses[call_count]
            call_count += 1
            return resp

        with patch("backend.app.agent.graph.call_llm_streaming", side_effect=mock_create):
            await run_agent(
                session_id=sample_session.id,
                file_path=sample_csv,
                is_initial_analysis=False,
                send_event=mock_send_event,
                db=db,
            )

        event_types = [e["event"] for e in collected_events]

        assert "status" in event_types
        assert "text" in event_types
        assert "done" in event_types
        # No session_update when title is null
        assert "session_update" not in event_types


class TestErrorRecovery:
    """Agent retries when a SQL query fails."""

    @pytest.mark.asyncio
    async def test_agent_retries_on_sql_error(
        self, db, sample_session, sample_csv, mock_send_event, collected_events
    ):
        # Step 1: Agent tries a bad query
        response_1 = make_tool_use_response(
            text_content="Let me check the revenue column.",
            tool_calls=[
                ("sql_query", {"query": "SELECT revenue FROM data", "description": "Get revenue"}),
            ],
        )
        # Step 2: Agent sees the error, tries a correct query
        response_2 = make_tool_use_response(
            text_content="That column doesn't exist. Let me check score instead.",
            tool_calls=[
                ("sql_query", {"query": "SELECT AVG(score) FROM data", "description": "Average score"}),
            ],
        )
        # Step 3: Agent responds and finalizes
        response_3 = make_tool_use_response(
            tool_calls=[
                ("output_text", {"text": "The average score is 87.7."}),
                ("finalize", {"session_title": None}),
            ],
        )

        mock_responses = [response_1, response_2, response_3]
        call_count = 0

        async def mock_create(*args, **kwargs):
            nonlocal call_count
            resp = mock_responses[call_count]
            call_count += 1
            return resp

        with patch("backend.app.agent.graph.call_llm_streaming", side_effect=mock_create):
            await run_agent(
                session_id=sample_session.id,
                file_path=sample_csv,
                is_initial_analysis=False,
                send_event=mock_send_event,
                db=db,
            )

        # Should have two status events for the two sql_query calls
        status_events = [e for e in collected_events if e["event"] == "status"]
        status_messages = [e["data"]["message"] for e in status_events]
        assert "Get revenue" in status_messages
        assert "Average score" in status_messages


class TestStopCancellation:
    """User sends stop — graph should end early."""

    @pytest.mark.asyncio
    async def test_stop_cancels_execution(
        self, db, sample_session, sample_csv, mock_send_event, collected_events
    ):
        # Agent starts a long tool call but should_stop is True
        response_1 = make_tool_use_response(
            tool_calls=[
                ("sql_query", {"query": "SELECT * FROM data", "description": "Fetch all"}),
            ],
        )

        call_count = 0

        async def mock_create(*args, **kwargs):
            nonlocal call_count
            call_count += 1
            return response_1

        with patch("backend.app.agent.graph.call_llm_streaming", side_effect=mock_create):
            await run_agent(
                session_id=sample_session.id,
                file_path=sample_csv,
                is_initial_analysis=False,
                send_event=mock_send_event,
                db=db,
                should_stop=True,
            )

        event_types = [e["event"] for e in collected_events]
        assert "done" in event_types
        # Should not have entered the planner loop at all (or exited immediately)
        assert call_count == 0


class TestParallelToolCalls:
    """Agent returns multiple tool_use blocks — executed in parallel via asyncio.gather."""

    @pytest.mark.asyncio
    async def test_multiple_tools_in_one_step(
        self, db, sample_session, sample_csv, mock_send_event, collected_events
    ):
        response_1 = make_tool_use_response(
            text_content="I'll run two queries at once.",
            tool_calls=[
                ("sql_query", {"query": "SELECT COUNT(*) FROM data", "description": "Count rows"}),
                ("sql_query", {"query": "SELECT AVG(age) FROM data", "description": "Average age"}),
            ],
        )
        response_2 = make_tool_use_response(
            tool_calls=[
                ("output_text", {"text": "There are 5 rows, average age is 28."}),
                ("finalize", {"session_title": None}),
            ],
        )

        mock_responses = [response_1, response_2]
        call_count = 0

        async def mock_create(*args, **kwargs):
            nonlocal call_count
            resp = mock_responses[call_count]
            call_count += 1
            return resp

        with patch("backend.app.agent.graph.call_llm_streaming", side_effect=mock_create):
            await run_agent(
                session_id=sample_session.id,
                file_path=sample_csv,
                is_initial_analysis=False,
                send_event=mock_send_event,
                db=db,
            )

        status_events = [e for e in collected_events if e["event"] == "status" and e["data"]["message"] in ("Count rows", "Average age")]
        assert len(status_events) == 2
