"""T3.6 — the projects board: derived health, human-only parked, payload
queries for linked work. The spec's render asserts live in the client
suite; these pin the API contract on the spine."""

from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

import json

from app import db, projects
import app.main as main


@pytest.fixture()
def db_file(tmp_path: Path) -> Path:
    path = tmp_path / "projects.db"
    conn = db.connect(path)
    db.apply_migrations(conn)
    conn.close()
    return path


@pytest.fixture()
def client(db_file: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("EUDAIMONIA_DB", str(db_file))
    return TestClient(main.app)


def test_board_lists_three_columns_with_parked_since(db_file: Path, client: TestClient) -> None:
    body = client.get("/api/projects").json()
    names = [p["name"] for p in body["projects"]]
    assert names == ["Market Momentum", "Kerdos", "Eudaimonia"]
    assert all(p["status"] == "active" for p in body["projects"])
    # an active project has no parked-since date
    assert all(p["parked_since"] is None for p in body["projects"])


def test_park_then_reactivate_via_the_door(db_file: Path, client: TestClient) -> None:
    listing = client.get("/api/projects").json()["projects"]
    pid = listing[0]["project_id"]

    parked = client.post(
        "/api/events/project_status",
        json={
            "idempotency_key": "device-park",
            "kind": "project_status",
            "ts": 1795000000000,
            "payload": {"project_id": pid, "status": "parked"},
        },
    )
    assert parked.status_code == 200
    body = client.get("/api/projects").json()["projects"][0]
    assert body["status"] == "parked"
    assert body["parked_since"] is not None  # the parked-since date, muted tier at render

    back = client.post(
        "/api/events/project_status",
        json={
            "idempotency_key": "device-park",
            "kind": "project_status",
            "ts": 1795000900000,
            "payload": {"project_id": pid, "status": "active"},
        },
    )
    assert back.status_code == 200
    body = client.get("/api/projects").json()["projects"][0]
    assert body["status"] == "active"


def test_parked_fold_refuses_a_non_human_actor(db_file: Path) -> None:
    """The repo-level single-writer gate: a parked transition from an
    agent is RECORDED but never applied — the row stays the owner's."""
    conn = db.connect(db_file)
    projects.seed_projects(conn)
    row = conn.execute("SELECT id, status FROM project ORDER BY id LIMIT 1").fetchone()
    pid, before = int(row["id"]), str(row["status"])
    db.insert_event(
        conn,
        kind="project_status",
        origin="agent-write",
        source_id=None,
        external_ref="project:agent-park-attempt",
        actor="clio",
        payload={"project_id": pid, "status": "parked"},
    )
    projects.apply_status(conn, "project_status", {"project_id": pid, "status": "parked"}, "clio")
    after = conn.execute("SELECT status FROM project WHERE id = ?", (pid,)).fetchone()[0]
    conn.close()
    assert before == "active"
    assert after == "active"  # the fold refused: parked is human-only


def test_unlinked_project_has_no_health_line(db_file: Path, client: TestClient) -> None:
    body = client.get("/api/projects").json()
    for p in body["projects"]:
        assert p["board_health"] is None  # no fabricated health (law 7)
        assert p["board_glob"] is None  # the kanban chain is descoped


def test_linked_work_derives_by_payload_query(db_file: Path) -> None:
    conn = db.connect(db_file)
    projects.seed_projects(conn)
    pid = int(conn.execute("SELECT id FROM project ORDER BY id LIMIT 1").fetchone()[0])
    # a fixture carrying project_id inside a task_seen payload (07 §19 (a))
    db.insert_event(
        conn,
        kind="task_seen",
        origin="app-write",
        source_id=None,
        external_ref="task:linked-1",
        actor="system",
        payload={"text": "linked work", "project_id": pid},
    )
    work = projects._linked_work(conn, pid)
    assert work == {"open": 1, "resolved": 0}
    # another project's linked work stays empty — the query is per project
    other = projects._linked_work(conn, pid + 1)
    assert other == {"open": 0, "resolved": 0}
    conn.close()


def test_no_stored_progress_anywhere(db_file: Path) -> None:
    """Grep gate: progress is derived, never stored (07 §17)."""
    import pathlib

    root = Path(__file__).resolve().parents[2]
    offenders = []
    for py in (root / "app" / "app").rglob("*.py"):
        text = py.read_text(encoding="utf-8").lower()
        if "progress_percent" in text or "percent_complete" in text:
            offenders.append(py.name)
    assert offenders == []


def test_detail_route_returns_the_project(db_file: Path, client: TestClient) -> None:
    listing = client.get("/api/projects").json()["projects"]
    pid = listing[1]["project_id"]
    detail = client.get(f"/api/projects/{pid}").json()
    assert detail["name"] == listing[1]["name"]
    assert "linked_work" in detail and "last_activity" in detail
    assert client.get("/api/projects/9999").status_code == 404
