"""Task pages: notes, subtasks and timed sessions per plan subject.

- the phone's offline door (/api/events/{kind}) and Hermes's door
  (/api/tasks/...) land on ONE thread per subject, matched case-insensitively
- next-time notes leave the page when dismissed (checked); subtasks stay,
  ticked; removed items are gone
- a session started and ended reports its minutes; an open one is "running"
- bad payloads are 422s, never quiet 200s
"""

import time
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import app.main as main
from app import db


@pytest.fixture()
def client(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    path = tmp_path / "tasks.db"
    conn = db.connect(path)
    db.apply_migrations(conn)
    conn.close()
    monkeypatch.setenv("EUDAIMONIA_DB", str(path))
    return TestClient(main.app)


KEY = "device-uuid-0001"


def phone(client: TestClient, kind: str, payload: dict[str, object], ts: int | None = None) -> None:
    ts = ts if ts is not None else int(time.time() * 1000)
    r = client.post(
        f"/api/events/{kind}",
        json={"idempotency_key": KEY, "kind": kind, "ts": ts, "payload": payload},
    )
    assert r.status_code == 200, r.text


def test_phone_and_hermes_share_one_thread(client: TestClient) -> None:
    phone(
        client,
        "task_item_added",
        {"subject": "GRE", "item_id": "item-aaaa-1", "type": "subtask", "text": "redo quant set 2"},
    )
    r = client.post(
        "/api/tasks/gre/items",
        json={"type": "next", "text": "start with RC passage 4", "actor": "noesis"},
    )
    assert r.status_code == 200
    body = client.get("/api/tasks/Gre").json()
    assert body["subject"] == "GRE"
    assert [s["text"] for s in body["subtasks"]] == ["redo quant set 2"]
    assert [(n["text"], n["actor"]) for n in body["next"]] == [
        ("start with RC passage 4", "noesis")
    ]


def test_check_dismiss_and_remove(client: TestClient) -> None:
    phone(
        client,
        "task_item_added",
        {"subject": "DL", "item_id": "item-bbbb-1", "type": "subtask", "text": "ex 3.4"},
    )
    phone(
        client,
        "task_item_added",
        {"subject": "DL", "item_id": "item-bbbb-2", "type": "next", "text": "reread 3.2"},
    )
    phone(
        client,
        "task_item_added",
        {"subject": "DL", "item_id": "item-bbbb-3", "type": "subtask", "text": "gone"},
    )
    phone(client, "task_item_checked", {"item_id": "item-bbbb-1", "done": True})
    phone(client, "task_item_checked", {"item_id": "item-bbbb-2", "done": True})
    assert client.post("/api/tasks/items/item-bbbb-3/remove", json={}).status_code == 200
    body = client.get("/api/tasks/DL").json()
    assert [(s["text"], s["done"]) for s in body["subtasks"]] == [("ex 3.4", True)]
    assert body["next"] == []
    summary = {t["subject"]: t for t in client.get("/api/tasks").json()["tasks"]}
    assert summary["DL"]["open_subtasks"] == 0


def test_timed_session_reports_minutes_and_running(client: TestClient) -> None:
    start = int(time.time() * 1000) - 25 * 60 * 1000
    phone(client, "task_session_started", {"subject": "GRE", "session_id": "sess-0000-1"}, ts=start)
    body = client.get("/api/tasks/GRE").json()
    assert body["running"]["session_id"] == "sess-0000-1"
    phone(client, "task_session_ended", {"session_id": "sess-0000-1", "note": "did 20 quant qs"})
    body = client.get("/api/tasks/GRE").json()
    assert body["running"] is None
    assert body["history"][0]["minutes"] in (24, 25)
    assert body["history"][0]["text"] == "did 20 quant qs"
    assert body["minutes_7d"] in (24, 25)


def test_hermes_log_with_minutes(client: TestClient) -> None:
    r = client.post(
        "/api/tasks/Reading/logs", json={"text": "read ch 2", "minutes": 40, "actor": "clio"}
    )
    assert r.status_code == 200
    body = client.get("/api/tasks/reading").json()
    assert body["history"][0]["text"] == "read ch 2"
    assert body["minutes_total"] == 40


def test_bad_payloads_are_422(client: TestClient) -> None:
    r = client.post(
        "/api/events/task_item_added",
        json={
            "idempotency_key": KEY,
            "kind": "task_item_added",
            "ts": int(time.time() * 1000),
            "payload": {"subject": "GRE", "item_id": "item-cccc-1", "type": "bogus", "text": "x"},
        },
    )
    assert r.status_code == 422
    assert client.post("/api/tasks/GRE/items", json={"text": "  "}).status_code == 422
    assert client.post("/api/tasks/GRE/logs", json={"text": "x", "minutes": 0}).status_code == 422
