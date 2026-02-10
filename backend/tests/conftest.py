"""Shared fixtures for agent tests."""

import csv
import os
import tempfile
import uuid

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.app.database import Base
from backend.app.models.user import User
from backend.app.models.session import Session
from backend.app.models.file import File
from backend.app.models.message import Message


@pytest.fixture
def db():
    """In-memory SQLite database with all tables created."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    SessionLocal = sessionmaker(bind=engine)
    session = SessionLocal()
    yield session
    session.close()


@pytest.fixture
def sample_user(db):
    """A persisted test user."""
    user = User(id=str(uuid.uuid4()), email="test@example.com", password_hash="fakehash")
    db.add(user)
    db.commit()
    return user


@pytest.fixture
def sample_session(db, sample_user):
    """A persisted test session owned by sample_user."""
    sess = Session(id=str(uuid.uuid4()), user_id=sample_user.id, title="Test Session")
    db.add(sess)
    db.commit()
    return sess


@pytest.fixture
def sample_csv():
    """Create a temporary CSV file and return its path. Cleaned up after test."""
    tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False, newline="")
    writer = csv.writer(tmp)
    writer.writerow(["id", "name", "age", "score"])
    writer.writerow([1, "Alice", 30, 85.5])
    writer.writerow([2, "Bob", 25, 92.0])
    writer.writerow([3, "Charlie", 35, 78.3])
    writer.writerow([4, "Diana", 28, None])
    writer.writerow([5, "Eve", 22, 95.1])
    tmp.close()
    yield tmp.name
    os.unlink(tmp.name)


@pytest.fixture
def large_csv():
    """CSV with 200 rows for testing truncation."""
    tmp = tempfile.NamedTemporaryFile(mode="w", suffix=".csv", delete=False, newline="")
    writer = csv.writer(tmp)
    writer.writerow(["id", "value"])
    for i in range(200):
        writer.writerow([i, i * 10])
    tmp.close()
    yield tmp.name
    os.unlink(tmp.name)


@pytest.fixture
def collected_events():
    """List that collects WS events sent during a test. Used with mock_send_event."""
    return []


@pytest.fixture
def mock_send_event(collected_events):
    """Async callable that mimics send_event but just appends to collected_events."""
    async def _send(event: str, data: dict):
        collected_events.append({"event": event, "data": data})
    return _send
