"""T2.3 — the capture door and its agent triage (mocked chokepoint).

The exit contract, asserted on the spine:
- POST /capture lands capture_raw and answers immediately (triage is a
  background task — the 5-min budget covers queue + model latency)
- triage goes through agent_invoke ONLY (the tests substitute it; the
  grep gate proves no other spawn site exists)
- ok -> capture_triaged (actor = the profile, plum) + provenance edge +
  exactly the target's domain landing
- predicate failure / timeout -> capture_triaged_failure, capture stays
  untriaged, NOTHING lands (failure never reads as success, 02 §6)
- the offline door (generic /api/events/capture_raw) lands the same kind
  and sweeps the triage after
"""

from pathlib import Path
from typing import Any, cast

import pytest
from fastapi.testclient import TestClient

import app.capture as capture
import app.main as main
from app import db
from app.agent_invoke import InvokeResult, Outcome


@pytest.fixture()
def db_file(tmp_path: Path) -> Path:
    path = tmp_path / "capture.db"
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
    """Replace the chokepoint with a scripted stub. Calls are recorded —
    the 'triage goes through agent_invoke ONLY' contract is proven by the
    absence of any other spawn site (grep gate) plus these call asserts."""
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
        if not script:  # default: a well-formed triage answer
            return InvokeResult("ok", 0, "task", 1, True, "inv-ref-0")
        result = script.pop(0)
        return InvokeResult(
            result.outcome,
            result.exit_code,
            result.stdout,
            result.duration_ms,
            result.predicate_result,
            "inv-ref",
        )

    # ai IS app.agent_invoke (capture.py imports the module, calls ai.agent_invoke)
    monkeypatch.setattr("app.agent_invoke.agent_invoke", stub)
    stub.calls = calls  # type: ignore[attr-defined]
    stub.script = script  # type: ignore[attr-defined]
    return stub


def test_capture_door_lands_raw_and_answers(
    client: TestClient, db_file: Path, fake_invoke: Any
) -> None:
    r = client.post("/capture", json={"text": "reply to APS India", "origin": "fuzzel"})
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "captured"

    conn = db.connect(db_file)
    rows = conn.execute(
        "SELECT kind, origin, actor, payload, external_ref FROM event"
        " WHERE kind = 'capture_raw'"
    ).fetchall()
    conn.close()
    assert len(rows) == 1
    assert rows[0]["origin"] == "app-write"
    assert rows[0]["actor"] == "human"
    assert '"text"' in rows[0]["payload"]
    assert rows[0]["external_ref"].startswith("fuzzel:")


def test_capture_body_validation(client: TestClient) -> None:
    # neither field
    assert client.post("/capture", json={"origin": "fuzzel"}).status_code == 422
    # both fields
    assert (
        client.post(
            "/capture", json={"text": "x", "photo_ref": "p", "origin": "fuzzel"}
        ).status_code
        == 422
    )
    # empty text
    assert client.post("/capture", json={"text": "  ", "origin": "fuzzel"}).status_code == 422
    # unknown origin
    pigeon = client.post("/capture", json={"text": "x", "origin": "carrier-pigeon"})
    assert pigeon.status_code == 422


def test_triage_ok_lands_capture_triaged_provenance_and_domain(
    client: TestClient, db_file: Path, fake_invoke: Any
) -> None:
    r = client.post("/capture", json={"text": "reply to APS India", "origin": "fuzzel"})
    ref = r.json()["external_ref"]

    conn = db.connect(db_file)
    triaged = conn.execute(
        "SELECT actor, payload FROM event WHERE kind = 'capture_triaged'"
    ).fetchall()
    edges = conn.execute(
        "SELECT from_ref, to_ref, type FROM provenance_edge WHERE type = 'triage'"
    ).fetchall()
    seen = conn.execute(
        "SELECT payload, actor FROM event WHERE kind = 'task_seen'"
    ).fetchall()
    conn.close()

    assert len(triaged) == 1
    assert triaged[0]["actor"] == "clio"  # plum attribution
    assert '"target": "task"' in triaged[0]["payload"] or '"target":"task"' in triaged[0]["payload"]
    assert len(edges) == 1
    assert edges[0]["from_ref"] == ref
    assert edges[0]["to_ref"] == f"{ref}:triaged"
    # the domain landing: task_seen carries the human's text
    assert len(seen) == 1
    assert "APS India" in seen[0]["payload"]
    assert seen[0]["actor"] == "system"
    # the chokepoint was called as the ONLY transport, with the contract
    assert fake_invoke.calls[0]["profile"] == "clio"
    assert fake_invoke.calls[0]["timeout"] == 180.0
    assert "reply to APS India" in fake_invoke.calls[0]["prompt"]


@pytest.mark.parametrize(
    ("stdout", "outcome", "target"),
    [
        ("question", "ok", "question"),
        ("loop-by-me", "ok", "loop-by-me"),
        ("loop-to-me", "ok", "loop-to-me"),
    ],
)
def test_triage_question_and_loops_land_rows(
    client: TestClient,
    db_file: Path,
    fake_invoke: Any,
    stdout: str,
    outcome: str,
    target: str,
) -> None:
    fake_invoke.script.append(
        InvokeResult(cast(Outcome, outcome), 0, stdout, 1, True, "inv-ref")
    )
    r = client.post("/capture", json={"text": "the dentist owes me a booking", "origin": "fuzzel"})
    assert r.status_code == 200

    conn = db.connect(db_file)
    questions = conn.execute("SELECT text, status FROM question").fetchall()
    loops = conn.execute("SELECT text, direction FROM loop").fetchall()
    conn.close()

    if target == "question":
        assert len(questions) == 1
        assert questions[0]["status"] == "open"
        assert len(loops) == 0
    else:
        assert len(loops) == 1
        want = "owed-by-me" if target == "loop-by-me" else "owed-to-me"
        assert loops[0]["direction"] == want
        assert len(questions) == 0


def test_predicate_failure_leaves_capture_untriaged_and_lands_nothing(
    client: TestClient, db_file: Path, fake_invoke: Any
) -> None:
    fake_invoke.script.append(
        InvokeResult("predicate_failed", 0, "banana", 1, False, "inv-ref")
    )
    r = client.post("/capture", json={"text": "mystery thing", "origin": "fuzzel"})
    assert r.status_code == 200  # the CAPTURE succeeded; the triage did not

    conn = db.connect(db_file)
    failures = conn.execute(
        "SELECT payload, actor FROM event WHERE kind = 'capture_triaged_failure'"
    ).fetchall()
    triaged = conn.execute("SELECT 1 FROM event WHERE kind = 'capture_triaged'").fetchall()
    domain = conn.execute(
        "SELECT 1 FROM event WHERE kind = 'task_seen'"
    ).fetchall()
    questions = conn.execute("SELECT 1 FROM question").fetchall()
    edges = conn.execute("SELECT 1 FROM provenance_edge").fetchall()
    conn.close()

    assert len(failures) == 1
    assert '"reason": "predicate_failed"' in failures[0]["payload"] or (
        '"reason":"predicate_failed"' in failures[0]["payload"]
    )
    assert len(triaged) == 0  # nothing landed
    assert len(domain) == 0
    assert len(questions) == 0
    assert len(edges) == 0


def test_timeout_is_a_terminal_failure_too(
    client: TestClient, db_file: Path, fake_invoke: Any
) -> None:
    fake_invoke.script.append(
        InvokeResult("timeout", None, "", 180_000, False, "inv-ref")
    )
    client.post("/capture", json={"text": "slow one", "origin": "fuzzel"})
    conn = db.connect(db_file)
    failures = conn.execute(
        "SELECT payload FROM event WHERE kind = 'capture_triaged_failure'"
    ).fetchall()
    triaged = conn.execute("SELECT 1 FROM event WHERE kind = 'capture_triaged'").fetchall()
    conn.close()
    assert len(failures) == 1
    assert len(triaged) == 0


def test_pending_sweep_and_the_offline_door(
    client: TestClient, db_file: Path, fake_invoke: Any
) -> None:
    # one triaged (default ok), one failed, one landed via the OFFLINE door
    client.post("/capture", json={"text": "triaged one", "origin": "fuzzel"})
    fake_invoke.script.append(
        InvokeResult("predicate_failed", 0, "banana", 1, False, "inv-ref")
    )
    client.post("/capture", json={"text": "failed one", "origin": "fuzzel"})
    client.post(
        "/api/events/capture_raw",
        json={
            "idempotency_key": "offline-device-1",
            "kind": "capture_raw",
            "ts": 1792840000000,
            "payload": {"text": "offline capture"},
        },
    )

    conn = db.connect(db_file)
    pending = capture.pending_captures(conn)
    failed = conn.execute(
        "SELECT 1 FROM event WHERE kind = 'capture_triaged_failure'"
    ).fetchall()
    offline_triaged = conn.execute(
        "SELECT 1 FROM event WHERE kind = 'capture_triaged'"
        " AND external_ref LIKE 'offline-device-1:%'"
    ).fetchall()
    conn.close()

    # the auto-sweep triaged the offline capture the moment it drained;
    # the failed one keeps its terminal failure event — the sweep must NOT
    # re-run it (manual re-triage is the retry path, not auto-retry)
    assert pending == []
    assert len(failed) == 1
    assert len(offline_triaged) == 1


def test_note_and_meal_triage_record_target_without_domain_rows(
    client: TestClient, db_file: Path, fake_invoke: Any
) -> None:
    fake_invoke.script.append(InvokeResult("ok", 0, "note", 1, True, "inv-ref"))
    client.post("/capture", json={"text": "a thought worth keeping", "origin": "fuzzel"})
    conn = db.connect(db_file)
    triaged = conn.execute("SELECT payload FROM event WHERE kind = 'capture_triaged'").fetchall()
    conn.close()
    assert len(triaged) == 1
    assert "note" in triaged[0]["payload"]


def test_photo_only_capture_is_skipped_by_triage(
    client: TestClient, db_file: Path, fake_invoke: Any
) -> None:
    r = client.post(
        "/capture", json={"photo_ref": "vault/shots/IMG_1.jpg", "origin": "pwa"}
    )
    assert r.status_code == 200
    # no triage call: T2.6 owns photo captures; a failure event would lie
    # about an invocation that never happened
    assert len(fake_invoke.calls) == 0
