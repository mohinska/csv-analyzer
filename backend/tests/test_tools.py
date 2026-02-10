"""Tests for individual tool execution — sql_query, output_text, output_table, create_plot, finalize."""

import json

import pytest

from backend.app.agent.tools import (
    execute_sql_query,
    execute_output_text,
    execute_output_table,
    execute_create_plot,
    execute_finalize,
)


# ---------------------------------------------------------------------------
# sql_query
# ---------------------------------------------------------------------------

class TestSqlQuery:
    @pytest.mark.asyncio
    async def test_returns_columns_and_rows(self, sample_csv):
        result = await execute_sql_query(
            query="SELECT * FROM data",
            description="Fetch all rows",
            file_path=sample_csv,
        )
        assert "columns" in result
        assert "rows" in result
        assert result["columns"] == ["id", "name", "age", "score"]
        assert len(result["rows"]) == 5

    @pytest.mark.asyncio
    async def test_truncates_to_max_rows(self, large_csv):
        result = await execute_sql_query(
            query="SELECT * FROM data",
            description="Fetch all",
            file_path=large_csv,
            max_rows=50,
        )
        assert len(result["rows"]) == 50
        assert result["row_count"] == 200

    @pytest.mark.asyncio
    async def test_returns_result_metadata(self, sample_csv):
        result = await execute_sql_query(
            query="SELECT name FROM data WHERE age > 25",
            description="Adults over 25",
            file_path=sample_csv,
        )
        assert result["is_error"] is False
        assert "columns" in result
        assert "rows" in result
        assert "row_count" in result

    @pytest.mark.asyncio
    async def test_handles_duckdb_error(self, sample_csv):
        result = await execute_sql_query(
            query="SELECT nonexistent_column FROM data",
            description="Bad query",
            file_path=sample_csv,
        )
        assert result["is_error"] is True
        assert "error" in result

    @pytest.mark.asyncio
    async def test_rejects_blocked_sql(self, sample_csv):
        result = await execute_sql_query(
            query="DROP TABLE data",
            description="Evil query",
            file_path=sample_csv,
        )
        assert result["is_error"] is True
        assert "not allowed" in result["error"].lower()


# ---------------------------------------------------------------------------
# output_text
# ---------------------------------------------------------------------------

class TestOutputText:
    @pytest.mark.asyncio
    async def test_sends_text_event(self, mock_send_event, collected_events):
        await execute_output_text(
            text="Here are the findings.",
            send_event=mock_send_event,
        )
        assert len(collected_events) == 1
        assert collected_events[0]["event"] == "text"
        assert collected_events[0]["data"]["text"] == "Here are the findings."

    @pytest.mark.asyncio
    async def test_saves_message_to_db(self, db, sample_session, mock_send_event):
        from backend.app.agent.persistence import save_tool_message

        save_tool_message(
            db=db,
            session_id=sample_session.id,
            tool_name="output_text",
            text="Test message",
            plot_data=None,
        )
        from backend.app.models.message import Message
        msgs = db.query(Message).filter(Message.session_id == sample_session.id).all()
        assert len(msgs) == 1
        assert msgs[0].role == "assistant"
        assert msgs[0].type == "text"
        assert msgs[0].text == "Test message"


# ---------------------------------------------------------------------------
# output_table
# ---------------------------------------------------------------------------

class TestOutputTable:
    @pytest.mark.asyncio
    async def test_sends_table_event(self, mock_send_event, collected_events):
        await execute_output_table(
            title="Summary",
            headers=["Name", "Score"],
            rows=[["Alice", 85], ["Bob", 92]],
            send_event=mock_send_event,
        )
        assert len(collected_events) == 1
        evt = collected_events[0]
        assert evt["event"] == "table"
        assert evt["data"]["title"] == "Summary"
        assert evt["data"]["headers"] == ["Name", "Score"]
        assert len(evt["data"]["rows"]) == 2

    @pytest.mark.asyncio
    async def test_saves_message_to_db(self, db, sample_session, mock_send_event):
        from backend.app.agent.persistence import save_tool_message

        save_tool_message(
            db=db,
            session_id=sample_session.id,
            tool_name="output_table",
            text="Summary",
            plot_data=json.dumps({"headers": ["A"], "rows": [[1]]}),
        )
        from backend.app.models.message import Message
        msg = db.query(Message).filter(Message.session_id == sample_session.id).first()
        assert msg.type == "table"
        assert json.loads(msg.plot_data)["headers"] == ["A"]


# ---------------------------------------------------------------------------
# create_plot
# ---------------------------------------------------------------------------

class TestCreatePlot:
    @pytest.mark.asyncio
    async def test_sends_plot_event(self, mock_send_event, collected_events):
        spec = {
            "data": [{"type": "bar", "x": ["A"], "y": [1]}],
            "layout": {"xaxis": {"title": "Category"}, "yaxis": {"title": "Value"}},
        }
        await execute_create_plot(
            title="My Chart",
            plotly_spec=spec,
            send_event=mock_send_event,
        )
        assert len(collected_events) == 1
        evt = collected_events[0]
        assert evt["event"] == "plot"
        assert evt["data"]["title"] == "My Chart"
        assert evt["data"]["plotly_spec"]["data"][0]["type"] == "bar"
    @pytest.mark.asyncio
    async def test_truncates_data_over_100_rows(self, mock_send_event, collected_events):
        big_x = list(range(200))
        big_y = [i * 2 for i in range(200)]
        spec = {
            "data": [{"type": "scatter", "mode": "markers", "x": big_x, "y": big_y}],
        }
        await execute_create_plot(
            title="Big Plot",
            plotly_spec=spec,
            send_event=mock_send_event,
        )
        sent_spec = collected_events[0]["data"]["plotly_spec"]
        assert len(sent_spec["data"][0]["x"]) <= 100
        assert len(sent_spec["data"][0]["y"]) <= 100

    @pytest.mark.asyncio
    async def test_saves_message_to_db(self, db, sample_session, mock_send_event):
        from backend.app.agent.persistence import save_tool_message

        spec = {"data": [{"type": "bar", "x": [], "y": []}], "layout": {}}
        save_tool_message(
            db=db,
            session_id=sample_session.id,
            tool_name="create_plot",
            text="My Chart",
            plot_data=json.dumps({"title": "My Chart", "plotly_spec": spec}),
        )
        from backend.app.models.message import Message
        msg = db.query(Message).filter(Message.session_id == sample_session.id).first()
        assert msg.type == "plot"
        parsed = json.loads(msg.plot_data)
        assert parsed["title"] == "My Chart"


# ---------------------------------------------------------------------------
# finalize
# ---------------------------------------------------------------------------

class TestFinalize:
    @pytest.mark.asyncio
    async def test_sends_done_event(self, mock_send_event, collected_events):
        await execute_finalize(
            session_title=None,
            send_event=mock_send_event,
        )
        assert len(collected_events) == 1
        assert collected_events[0]["event"] == "done"
        assert collected_events[0]["data"]["data_updated"] is False

    @pytest.mark.asyncio
    async def test_sets_session_title_when_provided(
        self, db, sample_session, mock_send_event, collected_events
    ):
        await execute_finalize(
            session_title="Sales Analysis Q4",
            send_event=mock_send_event,
            db=db,
            session_id=sample_session.id,
        )
        # Should send session_update event before done
        events = [e["event"] for e in collected_events]
        assert "session_update" in events
        assert "done" in events
        update_evt = next(e for e in collected_events if e["event"] == "session_update")
        assert update_evt["data"]["title"] == "Sales Analysis Q4"

        # DB should be updated
        from backend.app.models.session import Session
        db.refresh(sample_session)
        assert sample_session.title == "Sales Analysis Q4"

    @pytest.mark.asyncio
    async def test_skips_title_when_null(self, mock_send_event, collected_events):
        await execute_finalize(
            session_title=None,
            send_event=mock_send_event,
        )
        events = [e["event"] for e in collected_events]
        assert "session_update" not in events
        assert "done" in events
