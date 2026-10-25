"""T2.5 — the question lifecycle: open -> picked_up -> answered, with the
reversal edge back to open. The ONE writer is the ask flow, driven by
agent_invoke outcomes (02 §6; 08 §20's writer contract):

- POST /questions/{id}/ask -> picked_up + the background invocation
- predicate PASSED -> question_answered (actor = the profile, the answer
  text riding the payload) + the provenance edge + the row settles
  answered
- ANY terminal failure (timeout, error, predicate miss) -> the row
  REVERTS to open (a dead process cannot stick a question at picked_up —
  that is a defect by construction)
- "ask again" opens a NEW invocation — the reversal makes re-asking
  legal, and each ask is its own answer record
- an empty reply can never be an answer (freshness != success)
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
    path = tmp_path / "questions.db"
    conn = db.connect(path)
    db.apply_migrations(conn)
    conn.execute(
        "INSERT INTO source (name, globs, class, success_predicate, status, ts)"
        " VALUES ('app', '[]', 'behavioral', 'row-is-artifact', 'alive', ?)",
        (db.utc_now_iso(),),
    )
    conn.execute(
        "INSERT INTO question (text, ts) VALUES ('what breaks first at scale?', ?)",
        (db.utc_now_iso(),),
    )
    conn.commit()
    conn.close()
    return path


@pytest.fixture()
def client(db_file: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("EUDAIMONIA_DB", str(db_file))
    return TestClient(main.app)


@pytest.fixture()
def fake_invoke(monkeypatch: pytest.MonkeyPatch, db_file: Path) -> Any:
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
            "ok", 0, "the schema, at ~10x rows", 1, True, "inv-ref"
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


def row(db_file: Path) -> dict[str, Any]:
    conn = db.connect(db_file)
    r = dict(conn.execute("SELECT id, text, status FROM question").fetchone())
    conn.close()
    return r


def test_ask_picks_up_then_answer_settles(
    client: TestClient, db_file: Path, fake_invoke: Any
) -> None:
    r = client.post("/api/questions/1/ask")
    assert r.status_code == 200
    assert r.json()["status"] == "picked_up"
    assert r.json()["profile"] == "clio"
    # NOTE: the TestClient runs background tasks before the response
    # returns, so the picked_up row state is not observable here — the
    # receipt IS the picked-up proof; the row below is already settled.
    assert row(db_file)["status"] == "answered"

    # the answer record: event + provenance edge
    conn = db.connect(db_file)
    answers = conn.execute(
        "SELECT actor, payload FROM event WHERE kind = 'question_answered'"
    ).fetchall()
    edges = conn.execute(
        "SELECT from_ref, to_ref, type FROM provenance_edge WHERE type = 'answered'"
    ).fetchall()
    conn.close()

    assert len(answers) == 1
    assert answers[0]["actor"] == "clio"
    import json

    payload = json.loads(answers[0]["payload"])
    assert payload["question_id"] == 1
    assert payload["answer"] == "the schema, at ~10x rows"
    assert len(edges) == 1
    assert edges[0]["type"] == "answered"

    # the chokepoint was the transport, with the question as context
    assert fake_invoke.calls[0]["profile"] == "clio"
    assert "what breaks first at scale?" in fake_invoke.calls[0]["prompt"]
    assert fake_invoke.calls[0]["timeout"] == 180.0


def test_open_queue_lists_only_live_questions(
    client: TestClient, db_file: Path, fake_invoke: Any
) -> None:
    open_before = client.get("/api/questions/open").json()
    assert open_before["count"] == 1
    assert open_before["questions"][0]["status"] == "open"

    client.post("/api/questions/1/ask")  # settles answered
    after = client.get("/api/questions/open").json()
    assert after["count"] == 0  # answered is history, not pending work


def test_terminal_failure_reverts_to_open(
    client: TestClient, db_file: Path, fake_invoke: Any
) -> None:
    fake_invoke.script.append(
        InvokeResult("timeout", None, "", 180_000, False, "inv-ref")
    )
    client.post("/api/questions/1/ask")
    # the reversal edge: back to open, visibly — never stuck at picked_up
    assert row(db_file)["status"] == "open"

    # nothing landed as answered
    conn = db.connect(db_file)
    answers = conn.execute(
        "SELECT 1 FROM event WHERE kind = 'question_answered'"
    ).fetchall()
    conn.close()
    assert len(answers) == 0


def test_predicate_failure_reverts_to_open_too(
    client: TestClient, db_file: Path, fake_invoke: Any
) -> None:
    # an empty reply can never be an answer (freshness != success)
    fake_invoke.script.append(InvokeResult("predicate_failed", 0, "", 1, False, "inv-ref"))
    client.post("/api/questions/1/ask")
    assert row(db_file)["status"] == "open"


def test_ask_again_opens_a_new_invocation(
    client: TestClient, db_file: Path, fake_invoke: Any
) -> None:
    # first ask fails -> reverted to open
    fake_invoke.script.append(
        InvokeResult("error", 1, "", 27_000, False, "inv-ref-1")
    )
    client.post("/api/questions/1/ask")
    assert row(db_file)["status"] == "open"

    # "ask again": a NEW invocation — legal precisely because the row is open
    r = client.post("/api/questions/1/ask")
    assert r.status_code == 200
    assert len(fake_invoke.calls) == 2
    assert row(db_file)["status"] == "answered"


def test_unknown_question_is_422(client: TestClient) -> None:
    r = client.post("/api/questions/999/ask")
    assert r.status_code == 422
