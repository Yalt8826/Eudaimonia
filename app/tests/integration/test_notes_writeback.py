"""T2.4 — notes to the vault through the staged applier.

- 10 notes staged -> one apply -> exactly 10 appended lines, every
  provenance edge resolving to a real line number, and a SECOND apply
  changes zero bytes
- a crash between append and ledger cannot duplicate: the file content is
  the truth (the line is found, not re-appended), the ledger is the fast
  path
- a human line written into the daily note between staging and apply
  survives byte-identical; the note appends after it
- the daily note belongs to the owner's LOCAL day (IST default): a
  20:00 UTC note files into TOMORROW's note
- the triage-to-note landing mints note_added AND stages the write-back
"""

import json
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

import app.main as main
from app import db
from app.staged_writebacks import apply_pending, daily_note_path, note_line, stage


@pytest.fixture()
def env_dirs(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> tuple[Path, Path]:
    vault = tmp_path / "vault"
    (vault / "DailyNotes").mkdir(parents=True)
    staging = tmp_path / "staging"
    staging.mkdir()
    monkeypatch.setenv("EUDAIMONIA_DB", str(vault.parent / "notes.db"))
    monkeypatch.setenv("EUDAIMONIA_VAULT", str(vault))
    monkeypatch.setenv("EUDAIMONIA_STAGING", str(staging))
    conn = db.connect(vault.parent / "notes.db")
    db.apply_migrations(conn)
    conn.close()
    return vault, staging


@pytest.fixture()
def client(env_dirs: tuple[Path, Path]) -> TestClient:
    return TestClient(main.app)


def day_file(note_ts: str) -> Path:
    return daily_note_path(note_ts)


def test_ten_notes_one_pass_then_idempotent(
    client: TestClient, env_dirs: tuple[Path, Path], monkeypatch: pytest.MonkeyPatch
) -> None:
    vault, staging = env_dirs
    monkeypatch.setenv("EUDAIMONIA_TZ_OFFSET_MINUTES", "0")  # deterministic day
    ts = datetime.now(UTC).isoformat()
    for i in range(10):
        stage(external_ref=f"note:{i}", text=f"note number {i}", note_ts=ts)

    r = client.post("/api/notes/apply")
    assert r.status_code == 200
    assert r.json()["applied"] == 10

    day = day_file(ts)
    lines = day.read_text(encoding="utf-8").splitlines()
    assert len(lines) == 10
    assert lines[0].endswith("note number 0")
    assert lines[9].endswith("note number 9")

    conn = db.connect(vault.parent / "notes.db")
    edges = conn.execute(
        "SELECT to_ref FROM provenance_edge WHERE type = 'write-back'"
    ).fetchall()
    conn.close()
    assert len(edges) == 10
    for e in edges:
        lineno = int(e["to_ref"].rsplit("#L", 1)[1])
        assert 1 <= lineno <= 10

    before = day.read_bytes()
    r2 = client.post("/api/notes/apply")
    assert r2.json()["applied"] == 0
    assert day.read_bytes() == before
    assert len(list(staging.glob("pending-*.json"))) == 0


def test_crash_between_append_and_ledger_cannot_duplicate(
    env_dirs: tuple[Path, Path], monkeypatch: pytest.MonkeyPatch
) -> None:
    vault, staging = env_dirs
    monkeypatch.setenv("EUDAIMONIA_TZ_OFFSET_MINUTES", "0")
    ts = datetime.now(UTC).isoformat()
    stage(external_ref="note:crash", text="survives a SIGKILL", note_ts=ts)

    apply_pending()  # appends AND writes the ledger
    day = day_file(ts)
    assert len(day.read_text(encoding="utf-8").splitlines()) == 1

    # the crash window: the append landed but the ledger never caught up
    (staging / "applied.jsonl").write_text("")

    result = apply_pending()
    # the content check found the line — verified, recorded, NOT re-appended
    assert day.read_text(encoding="utf-8").splitlines().count(
        note_line(ts, "survives a SIGKILL")
    ) == 1
    assert result["applied"] == 0
    assert len(list(staging.glob("pending-*.json"))) == 0


def test_human_line_survives_and_note_appends_after(
    env_dirs: tuple[Path, Path], monkeypatch: pytest.MonkeyPatch
) -> None:
    vault, staging = env_dirs
    monkeypatch.setenv("EUDAIMONIA_TZ_OFFSET_MINUTES", "0")
    ts = datetime.now(UTC).isoformat()
    stage(external_ref="note:human", text="the staged thought", note_ts=ts)

    day = day_file(ts)
    day.write_text("a human line I wrote myself\n", encoding="utf-8")
    human_bytes = day.read_bytes()

    apply_pending()

    lines = day.read_text(encoding="utf-8").splitlines()
    assert lines[0] == "a human line I wrote myself"  # intact, still first
    assert lines[-1].endswith("the staged thought")  # the note appended after
    assert day.read_bytes()[: len(human_bytes)] == human_bytes


def test_late_utc_note_files_tomorrow_local(
    env_dirs: tuple[Path, Path], monkeypatch: pytest.MonkeyPatch
) -> None:
    vault, staging = env_dirs
    monkeypatch.setenv("EUDAIMONIA_TZ_OFFSET_MINUTES", "330")  # IST
    # 20:00 UTC is 01:30 IST — TOMORROW's daily note
    ts = datetime(2026, 10, 24, 20, 0, 0, tzinfo=UTC).isoformat()
    stage(external_ref="note:ist", text="the ist tomorrow note", note_ts=ts)

    apply_pending()

    ist = datetime(2026, 10, 25, 1, 30, 0)
    day = vault / "DailyNotes" / f"October-{ist.day}-{ist.year}.md"
    assert day.exists()
    assert "the ist tomorrow note" in day.read_text(encoding="utf-8")


def test_triage_to_note_mints_event_and_stages(
    client: TestClient, env_dirs: tuple[Path, Path], monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setenv("EUDAIMONIA_TZ_OFFSET_MINUTES", "330")
    vault, staging = env_dirs
    conn = db.connect(vault.parent / "notes.db")
    conn.execute(
        "INSERT INTO source (name, globs, class, success_predicate, status, ts)"
        " VALUES ('app', '[]', 'behavioral', 'row-is-artifact', 'alive', ?)",
        (db.utc_now_iso(),),
    )
    conn.commit()
    conn.close()

    from typing import cast

    from app.agent_invoke import InvokeResult

    def stub(profile: str, prompt: str, timeout: float = 120.0,
             success_predicate: Any = None, conn: Any = None,
             max_retries: int = 0) -> InvokeResult:
        return InvokeResult("ok", 0, "note", 1, True, "inv-ref")

    # patch the chokepoint module's function (capture.py calls ai.agent_invoke,
    # and ai IS app.agent_invoke — same module object)
    monkeypatch.setattr("app.agent_invoke.agent_invoke", cast(Any, stub))
    r = client.post(
        "/capture", json={"text": "a thought worth keeping", "origin": "fuzzel"}
    )
    assert r.status_code == 200

    conn = db.connect(vault.parent / "notes.db")
    note_added = conn.execute(
        "SELECT COUNT(*) FROM event WHERE kind = 'note_added'"
    ).fetchone()[0]
    conn.close()
    assert note_added == 1
    staged = list(staging.glob("pending-*.json"))
    assert len(staged) == 1
    entry = json.loads(staged[0].read_text(encoding="utf-8"))
    assert entry["text"] == "a thought worth keeping"
