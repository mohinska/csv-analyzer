"""Tests for message persistence — all message types saved correctly to DB."""

import json

import pytest

from backend.app.agent.persistence import save_tool_message, save_reasoning, save_user_message
from backend.app.models.message import Message


class TestSaveUserMessage:
    def test_user_message_saved(self, db, sample_session):
        save_user_message(db, sample_session.id, "What is the average score?")
        msgs = db.query(Message).filter(Message.session_id == sample_session.id).all()
        assert len(msgs) == 1
        assert msgs[0].role == "user"
        assert msgs[0].type == "text"
        assert msgs[0].text == "What is the average score?"
        assert msgs[0].plot_data is None


class TestSaveReasoning:
    def test_reasoning_saved_with_type_reasoning(self, db, sample_session):
        save_reasoning(db, sample_session.id, "I should query the averages first.")
        msgs = db.query(Message).filter(Message.session_id == sample_session.id).all()
        assert len(msgs) == 1
        assert msgs[0].role == "assistant"
        assert msgs[0].type == "reasoning"
        assert msgs[0].text == "I should query the averages first."
        assert msgs[0].plot_data is None


class TestSaveToolMessage:
    def test_text_saved_with_type_text(self, db, sample_session):
        save_tool_message(
            db=db,
            session_id=sample_session.id,
            tool_name="output_text",
            text="The average score is 85.",
            plot_data=None,
        )
        msg = db.query(Message).filter(Message.session_id == sample_session.id).first()
        assert msg.role == "assistant"
        assert msg.type == "text"
        assert msg.text == "The average score is 85."

    def test_plot_saved_with_plot_data_json(self, db, sample_session):
        spec = {"data": [{"type": "bar", "x": ["A", "B"], "y": [10, 20]}], "layout": {}}
        plot_data = json.dumps({"title": "Revenue Chart", "plotly_spec": spec})
        save_tool_message(
            db=db,
            session_id=sample_session.id,
            tool_name="create_plot",
            text="Revenue Chart",
            plot_data=plot_data,
        )
        msg = db.query(Message).filter(Message.session_id == sample_session.id).first()
        assert msg.role == "assistant"
        assert msg.type == "plot"
        parsed = json.loads(msg.plot_data)
        assert parsed["title"] == "Revenue Chart"
        assert parsed["plotly_spec"]["data"][0]["type"] == "bar"

    def test_query_result_saved_with_type_query_result(self, db, sample_session):
        qr_data = json.dumps({
            "query": "SELECT AVG(score) FROM data",
            "columns": ["avg_score"],
            "rows": [[85.5]],
            "row_count": 1,
        })
        save_tool_message(
            db=db,
            session_id=sample_session.id,
            tool_name="sql_query",
            text="Average score calculation",
            plot_data=qr_data,
        )
        msg = db.query(Message).filter(Message.session_id == sample_session.id).first()
        assert msg.role == "assistant"
        assert msg.type == "query_result"
        parsed = json.loads(msg.plot_data)
        assert parsed["query"] == "SELECT AVG(score) FROM data"

    def test_table_saved_with_type_table(self, db, sample_session):
        table_data = json.dumps({
            "headers": ["Column", "Type"],
            "rows": [["id", "INTEGER"], ["name", "VARCHAR"]],
        })
        save_tool_message(
            db=db,
            session_id=sample_session.id,
            tool_name="output_table",
            text="Schema Overview",
            plot_data=table_data,
        )
        msg = db.query(Message).filter(Message.session_id == sample_session.id).first()
        assert msg.role == "assistant"
        assert msg.type == "table"
        parsed = json.loads(msg.plot_data)
        assert parsed["headers"] == ["Column", "Type"]
