"""T2.3 — the capture list and the manual re-triage affordance.

- the list renders every capture with its honest state (triaged with the
  target / failed with the reason / untriaged)
- the MANUAL retry of a FAILED capture runs a fresh attempt beside the
  failure event (append-only; the failure event is never edited)
- a re-triage of an already-triaged capture appends a SECOND triage event
  (the override path); the first event and its provenance edge stay intact
- an unknown ref is 422, never a silent anything
- the sweep still skips settled captures — manual is the only retry path
"""

from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

import app.main as main
from app import db
from app.agent_invoke import InvokeResult


@pytest.fixture()
def db_file(tmp_path: Path) -> Path:
    path = tmp_path / "retriage.db"
    conn = db.connect(path)
    db.apply_migrations(conn)
    conn.close()
    return path


@pytest.fixture()
def client(db_file: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("EUDAIMONIA_DB", str(db_file))
    return TestClient(main.app)


@pytest.fixture()
def fake_invoke(monkeypatch: pytest.MonkeyPatch) -> Any:
    """Scripted chokepoint: pops answers in order; records every call."""
    calls: list[dict[str, Any]] = []
    script: list[InvokeResult] = []

    def stub(
        profile: str,
        prompt: str,
        timeout: float = 120.0,
        success_predicate: Any = None,
        conn: Any = None,
        max_retries: int = 0,
    ) -> InvokeResult:
        calls.append({"profile": profile, "prompt": prompt, "timeout": timeout})
        result = script.pop(0) if script else InvokeResult(
            "ok", 0, "task", 1, True, "inv-ref"
        )
        return InvokeResult(
            result.outcome,
            result.exit_code,
            result.stdout,
            result.duration_ms,
            result.predicate_result,
            "inv-ref",
        )

    monkeypatch.setattr("app.agent_invoke.agent_invoke", stub)
    stub.calls = calls  # type: ignore[attr-defined]
    stub.script = script  # type: ignore[attr-defined]
    return stub


def test_list_reports_each_state_honestly(
    client: TestClient, db_file: Path, fake_invoke: Any
) -> None:
    # triaged
    client.post("/capture", json={"text": "a task-shaped thing", "origin": "fuzzel"})
    # failed
    fake_invoke.script.append(
        InvokeResult("predicate_failed", 0, "banana", 1, False, "inv-ref")
    )
    client.post("/capture", json={"text": "an unclassifiable thing", "origin": "fuzzel"})
    # photo-only: skipped, stays untriaged
    client.post(
        "/capture", json={"photo_ref": "vault/shots/IMG_9.jpg", "origin": "pwa"}
    )

    r = client.get("/api/capture/recent")
    assert r.status_code == 200
    captures = r.json()["captures"]
    assert len(captures) == 3
    states = [c["state"] for c in captures]
    assert states.count("triaged") == 1
    assert states.count("failed") == 1
    assert states.count("untriaged") == 1
    failed = next(c for c in captures if c["state"] == "failed")
    assert failed["reason"] == "predicate_failed"
    triaged = next(c for c in captures if c["state"] == "triaged")
    assert triaged["target"] == "task"


def test_retry_of_failed_runs_fresh_attempt_beside_the_failure(
    client: TestClient, db_file: Path, fake_invoke: Any
) -> None:
    fake_invoke.script.append(
        InvokeResult("predicate_failed", 0, "banana", 1, False, "inv-ref")
    )
    ref = client.post(
        "/capture", json={"text": "mystery thing", "origin": "fuzzel"}
    ).json()["external_ref"]

    # the retry: a manual re-triage with a good answer this time
    fake_invoke.script.append(InvokeResult("ok", 0, "note", 1, True, "inv-ref-2"))
    r = client.post("/api/capture/retriage", json={"capture_ref": ref})
    assert r.status_code == 200
    assert r.json()["state"] == "triaged"

    conn = db.connect(db_file)
    events = conn.execute(
        "SELECT kind, external_ref FROM event"
        " WHERE kind IN ('capture_triaged', 'capture_triaged_failure')"
        " ORDER BY id"
    ).fetchall()
    edges = conn.execute(
        "SELECT from_ref, to_ref FROM provenance_edge WHERE type = 'triage'"
    ).fetchall()
    conn.close()

    # append-only: the failure event is STILL THERE, the new triage beside it
    assert [e["kind"] for e in events] == [
        "capture_triaged_failure",
        "capture_triaged",
    ]
    assert events[0]["external_ref"] == f"{ref}:failure"
    # attempt-numbered refs: the failure was attempt 1, this retry is
    # attempt 2 — the ref records WHICH try produced the answer
    assert events[1]["external_ref"] == f"{ref}:triaged:2"
    assert len(edges) == 1  # the new provenance edge (the failure had none)


def test_retriage_of_triaged_appends_second_event_first_intact(
    client: TestClient, db_file: Path, fake_invoke: Any
) -> None:
    ref = client.post(
        "/capture", json={"text": "originally a task", "origin": "fuzzel"}
    ).json()["external_ref"]

    # the human overrides: this was a note, not a task
    fake_invoke.script.append(InvokeResult("ok", 0, "note", 1, True, "inv-ref-2"))
    r = client.post("/api/capture/retriage", json={"capture_ref": ref})
    assert r.status_code == 200
    assert r.json()["state"] == "triaged"

    conn = db.connect(db_file)
    triaged = conn.execute(
        "SELECT external_ref, payload FROM event"
        " WHERE kind = 'capture_triaged' ORDER BY id"
    ).fetchall()
    task_seen = conn.execute(
        "SELECT COUNT(*) FROM event WHERE kind = 'task_seen'"
    ).fetchone()[0]
    conn.close()

    # append-only: first event intact, the override beside it
    assert len(triaged) == 2
    assert triaged[0]["external_ref"] == f"{ref}:triaged"
    assert triaged[1]["external_ref"] == f"{ref}:triaged:2"
    assert '"target": "task"' in triaged[0]["payload"]
    assert '"target": "note"' in triaged[1]["payload"]
    # the override corrects FORWARD: the first task_seen stands (append-only
    # — corrections are new events, never unwinding), the note's own landing
    # is T2.4's business and does not exist yet
    assert task_seen == 1


def test_unknown_ref_is_422(client: TestClient) -> None:
    r = client.post(
        "/api/capture/retriage", json={"capture_ref": "fuzzel:9999-99-99"}
    )
    assert r.status_code == 422


def test_sweep_still_skips_failed_even_after_the_list_shows_them(
    client: TestClient, db_file: Path, fake_invoke: Any
) -> None:
    fake_invoke.script.append(
        InvokeResult("predicate_failed", 0, "banana", 1, False, "inv-ref")
    )
    client.post("/capture", json={"text": "stays failed", "origin": "fuzzel"})
    calls_before = len(fake_invoke.calls)

    # a new capture lands -> the sweep runs -> it must NOT re-run the failed
    fake_invoke.script.append(InvokeResult("ok", 0, "task", 1, True, "inv-ref"))
    client.post("/capture", json={"text": "a fresh one", "origin": "fuzzel"})
    assert len(fake_invoke.calls) == calls_before + 1  # only the fresh capture
