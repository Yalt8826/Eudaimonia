"""T0.2 — migration 001, the forward-only runner, the coverage view, render states.

Every DB here lives in tmp_path — never the repo eudaimonia.db.
"""

from __future__ import annotations

import sqlite3
from collections.abc import Iterator
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from app.coverage import RENDER_STATES, derive_render_state
from app.db import (
    MIGRATIONS_DIR,
    apply_migrations,
    connect,
    db_path,
    insert_event,
    utc_now_iso,
)

REPO_ROOT = Path(__file__).resolve().parents[2]
SCHEMA_MIRROR_PATH = REPO_ROOT / "client" / "schemas" / "schema.sql"

V01_TABLES = {
    "source",
    "event",
    "loop",
    "question",
    "reading_item",
    "habit",
    "document",
    "provenance_edge",
    "context_note",
}
V02_TABLES = {"project", "goal", "assignment"}


@pytest.fixture()
def migrated(tmp_path: Path) -> Iterator[sqlite3.Connection]:
    """A fully migrated DB in tmp_path."""
    conn = connect(tmp_path / "t02.db")
    apply_migrations(conn)
    yield conn
    conn.close()


def _objects(conn: sqlite3.Connection) -> set[tuple[str, str]]:
    rows = conn.execute(
        "SELECT type, name FROM sqlite_master WHERE name NOT LIKE 'sqlite_%'"
    ).fetchall()
    return {(str(row["type"]), str(row["name"])) for row in rows}


def _scalar(conn: sqlite3.Connection, sql: str) -> object:
    row = conn.execute(sql).fetchone()
    assert row is not None
    return row[0]


def _source(
    conn: sqlite3.Connection,
    name: str,
    *,
    source_class: str = "pipeline",
    status: str = "alive",
    last_ok_read_ts: str | None = None,
) -> int:
    cursor = conn.execute(
        "INSERT INTO source"
        " (name, globs, class, success_predicate, last_ok_read_ts, status, ts)"
        " VALUES (?, ?, ?, ?, ?, ?, ?)",
        (
            name,
            "[]",
            source_class,
            "artifact passes the success predicate",
            last_ok_read_ts,
            status,
            utc_now_iso(),
        ),
    )
    rowid = cursor.lastrowid
    assert rowid is not None
    conn.commit()
    return rowid


def _read_event(
    conn: sqlite3.Connection,
    source_id: int,
    *,
    content_date: str,
    ok: int = 1,
    kind: str = "artifact",
) -> int:
    return insert_event(
        conn,
        kind=kind,
        origin="source-read",
        source_id=source_id,
        external_ref=f"{kind}:{content_date}",
        actor="system",
        payload={"ok": ok, "content_date": content_date},
    )


# --- apply + no-op ----------------------------------------------------------


def test_fresh_db_apply_creates_all_tables_and_view(tmp_path: Path) -> None:
    conn = connect(tmp_path / "fresh.db")
    assert apply_migrations(conn) == ["001"]
    objects = _objects(conn)
    names = {name for _, name in objects}
    assert (V01_TABLES | V02_TABLES | {"schema_migrations"}) <= names
    assert ("view", "coverage") in objects
    conn.close()


def test_runner_rerun_is_noop(tmp_path: Path) -> None:
    conn = connect(tmp_path / "noop.db")
    assert apply_migrations(conn) == ["001"]
    before = _objects(conn)
    row = conn.execute(
        "SELECT applied_at FROM schema_migrations WHERE version = '001'"
    ).fetchone()
    assert row is not None
    applied_at = str(row["applied_at"])

    assert apply_migrations(conn) == []
    assert _objects(conn) == before

    row_after = conn.execute(
        "SELECT applied_at FROM schema_migrations WHERE version = '001'"
    ).fetchone()
    assert row_after is not None
    assert str(row_after["applied_at"]) == applied_at  # not re-recorded
    conn.close()


def test_runner_refuses_gap_between_files(tmp_path: Path) -> None:
    mdir = tmp_path / "migrations"
    mdir.mkdir()
    (mdir / "001_first.sql").write_text("CREATE TABLE a (id INTEGER PRIMARY KEY);\n")
    (mdir / "003_third.sql").write_text("CREATE TABLE b (id INTEGER PRIMARY KEY);\n")
    conn = connect(tmp_path / "gap.db")
    with pytest.raises(ValueError, match="gap"):
        apply_migrations(conn, mdir)
    conn.close()


def test_runner_refuses_missing_first_migration(tmp_path: Path) -> None:
    mdir = tmp_path / "migrations"
    mdir.mkdir()
    (mdir / "002_second.sql").write_text("CREATE TABLE a (id INTEGER PRIMARY KEY);\n")
    conn = connect(tmp_path / "gap2.db")
    with pytest.raises(ValueError, match="gap"):
        apply_migrations(conn, mdir)
    conn.close()


def test_runner_applies_pending_continuation(tmp_path: Path) -> None:
    """The forward path: 001 applied, 002 arrives — it applies, 001 stays."""
    mdir = tmp_path / "migrations"
    mdir.mkdir()
    (mdir / "001_first.sql").write_text("CREATE TABLE a (id INTEGER PRIMARY KEY);\n")
    conn = connect(tmp_path / "cont.db")
    assert apply_migrations(conn, mdir) == ["001"]
    (mdir / "002_second.sql").write_text("CREATE TABLE b (id INTEGER PRIMARY KEY);\n")
    assert apply_migrations(conn, mdir) == ["002"]
    assert {"a", "b"} <= {name for _, name in _objects(conn)}
    conn.close()


# --- spine idempotency (02 §1) ----------------------------------------------


def test_spine_duplicate_triple_raises(migrated: sqlite3.Connection) -> None:
    source_id = _source(migrated, "digest")

    def insert() -> None:
        insert_event(
            migrated,
            kind="artifact",
            origin="source-read",
            source_id=source_id,
            external_ref="day-report:2026-10-08",
            actor="system",
            payload={"ok": 1, "content_date": "2026-10-08"},
        )

    insert()
    with pytest.raises(sqlite3.IntegrityError):
        insert()


def test_spine_insert_or_ignore_dedupes(migrated: sqlite3.Connection) -> None:
    source_id = _source(migrated, "digest")
    sql = (
        "INSERT OR IGNORE INTO event"
        " (ts, kind, origin, source_id, external_ref, actor, payload)"
        " VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    args = (
        "2026-10-08T06:00:00+00:00",
        "artifact",
        "source-read",
        source_id,
        "day-report:2026-10-08",
        "system",
        '{"ok": 1, "content_date": "2026-10-08"}',
    )
    assert migrated.execute(sql, args).rowcount == 1
    assert migrated.execute(sql, args).rowcount == 0  # already-seen
    assert _scalar(migrated, "SELECT COUNT(*) FROM event") == 1


def test_connect_enforces_foreign_keys(migrated: sqlite3.Connection) -> None:
    with pytest.raises(sqlite3.IntegrityError):
        insert_event(
            migrated,
            kind="artifact",
            origin="source-read",
            source_id=9999,  # no such source
            external_ref="x",
            actor="system",
            payload={"ok": 1},
        )


def test_insert_event_round_trips_payload(migrated: sqlite3.Connection) -> None:
    source_id = _source(migrated, "wake")
    ts = "2026-10-09T06:30:00+00:00"
    rowid = insert_event(
        migrated,
        kind="habit_tap",
        origin="app-write",
        source_id=source_id,
        external_ref="device-uuid:1760000000",
        actor="human",
        payload={"method": "recall"},
        ts=ts,
    )
    row = migrated.execute("SELECT * FROM event WHERE id = ?", (rowid,)).fetchone()
    assert row is not None
    assert row["kind"] == "habit_tap"
    assert row["origin"] == "app-write"
    assert row["actor"] == "human"
    assert row["ts"] == ts
    assert row["payload"] == '{"method": "recall"}'


# --- document upsert shape (09 §1) ------------------------------------------


def test_document_unique_kind_week_layer_and_upsert(migrated: sqlite3.Connection) -> None:
    insert = (
        "INSERT INTO document (kind, week_id, layer, path, sections, ts)"
        " VALUES ('weekly-review', '2026-W41', 'mechanical', ?, ?, ?)"
    )
    migrated.execute(insert, ("/reviews/2026-W41.md", "{}", utc_now_iso()))
    with pytest.raises(sqlite3.IntegrityError):
        migrated.execute(insert, ("/reviews/other.md", "{}", utc_now_iso()))

    migrated.execute(
        insert
        + " ON CONFLICT (kind, week_id, layer) DO UPDATE"
        " SET path = excluded.path, sections = excluded.sections",
        ("/reviews/regen.md", '{"coverage": "8 sections"}', utc_now_iso()),
    )
    row = migrated.execute(
        "SELECT path, sections FROM document"
        " WHERE kind = 'weekly-review' AND week_id = '2026-W41'"
        " AND layer = 'mechanical'"
    ).fetchone()
    assert row is not None
    assert str(row["path"]) == "/reviews/regen.md"
    assert str(row["sections"]) == '{"coverage": "8 sections"}'
    assert _scalar(migrated, "SELECT COUNT(*) FROM document") == 1


# --- v0.2 CHECKs (single-writer status enums) -------------------------------


def test_goal_status_check_rejects_streak(migrated: sqlite3.Connection) -> None:
    migrated.execute(
        "INSERT INTO goal (title, target_date, status, links)"
        " VALUES ('dMAT', '2026-09-26', 'on-track', '[]')"
    )
    with pytest.raises(sqlite3.IntegrityError):
        migrated.execute(
            "INSERT INTO goal (title, target_date, status, links)"
            " VALUES ('GRE', NULL, 'streak', '[]')"
        )
    for status in ("on-track", "at-risk", "achieved", "parked"):
        migrated.execute("UPDATE goal SET status = ? WHERE title = 'dMAT'", (status,))


def test_assignment_status_accepts_exactly_four(migrated: sqlite3.Connection) -> None:
    for status in ("queued", "running", "done", "failed"):
        migrated.execute(
            "INSERT INTO assignment"
            " (profile, text, context_refs, status, origin_object_ref,"
            "  created_event_id, result_ref)"
            " VALUES ('clio', ?, '[]', ?, NULL, NULL, NULL)",
            (f"task for {status}", status),
        )
    assert (
        _scalar(migrated, "SELECT COUNT(*) FROM assignment WHERE status = 'queued'")
        == 1
    )
    with pytest.raises(sqlite3.IntegrityError):
        migrated.execute("UPDATE assignment SET status = 'cancelled'")


# --- schema mirror (client/schemas/schema.sql) ------------------------------


def test_schema_mirror_byte_equal() -> None:
    """The mirror is the plain byte concatenation of app/migrations/*.sql in
    lexicographic filename order — no separators, no header: every migration
    file ends with exactly one newline, so the files simply abut."""
    migrations = sorted(MIGRATIONS_DIR.glob("*.sql"), key=lambda p: p.name)
    assert migrations, "no migration files found"
    expected = b"".join(path.read_bytes() for path in migrations)
    assert SCHEMA_MIRROR_PATH.read_bytes() == expected


# --- coverage view (law 7) --------------------------------------------------


def test_coverage_view_empty_db_queries_clean(tmp_path: Path) -> None:
    conn = connect(tmp_path / "empty.db")
    apply_migrations(conn)
    assert conn.execute("SELECT * FROM coverage").fetchall() == []
    conn.close()


def test_coverage_view_registered_source_zero_events_honest_zeros(
    migrated: sqlite3.Connection,
) -> None:
    _source(migrated, "meals")
    rows = migrated.execute("SELECT * FROM coverage").fetchall()
    assert len(rows) == 1
    assert rows[0]["source_name"] == "meals"
    assert rows[0]["days_fresh_7"] == 0
    assert rows[0]["artifact_count"] == 0
    assert rows[0]["paused_evidence"] == 0


def test_coverage_seeded_one_passing_read(migrated: sqlite3.Connection) -> None:
    source_id = _source(migrated, "digest")
    today = datetime.now(UTC).date().isoformat()
    old = (datetime.now(UTC) - timedelta(days=9)).date().isoformat()
    _read_event(migrated, source_id, content_date=today, ok=1)
    _read_event(migrated, source_id, content_date=old, ok=1)  # outside the window
    _read_event(migrated, source_id, content_date=today, ok=0, kind="artifact_bad")
    _read_event(migrated, source_id, content_date=today, ok=1, kind="artifact_extra")

    rows = migrated.execute("SELECT * FROM coverage").fetchall()
    assert len(rows) == 1  # one row per source — counts, never per-day rows
    row = rows[0]
    assert row["source_name"] == "digest"
    assert row["class"] == "pipeline"
    assert row["status"] == "alive"
    assert row["days_fresh_7"] == 1  # one distinct passing day in the trailing 7
    assert row["artifact_count"] == 4  # all-time source-read events, pass or fail
    assert row["paused_evidence"] == 0


def test_paused_evidence_requires_human_actor(migrated: sqlite3.Connection) -> None:
    source_id = _source(migrated, "reports")
    insert_event(
        migrated,
        kind="job_paused",
        origin="app-write",
        source_id=source_id,
        external_ref="pause-1",
        actor="system",  # law 5: only a human pauses — the app never does
        payload={},
    )
    row = migrated.execute("SELECT * FROM coverage").fetchone()
    assert row is not None
    assert row["paused_evidence"] == 0

    insert_event(
        migrated,
        kind="job_paused",
        origin="app-write",
        source_id=source_id,
        external_ref="pause-2",
        actor="human",
        payload={},
    )
    row = migrated.execute("SELECT * FROM coverage").fetchone()
    assert row is not None
    assert row["paused_evidence"] == 1


# --- the five render states (fixed mapping, T0.2) ---------------------------


def test_five_render_states_from_view_facts(migrated: sqlite3.Connection) -> None:
    today = datetime.now(UTC).date().isoformat()
    silent = (datetime.now(UTC) - timedelta(days=30)).date().isoformat()

    alive_id = _source(migrated, "alive-src")
    _read_event(migrated, alive_id, content_date=today, ok=1)

    _source(migrated, "dead-src", status="dead")  # system failure only

    paused_id = _source(migrated, "paused-src")
    insert_event(
        migrated,
        kind="job_paused",
        origin="app-write",
        source_id=paused_id,
        external_ref="pause-1",
        actor="human",
        payload={},
    )

    dormant_id = _source(migrated, "dormant-src", source_class="behavioral")
    _read_event(migrated, dormant_id, content_date=silent, ok=1)  # data, but not fresh

    _source(migrated, "uninstrumented-src")  # registered, zero artifacts ever

    states = {
        str(row["source_name"]): derive_render_state(row)
        for row in migrated.execute("SELECT * FROM coverage").fetchall()
    }
    assert states == {
        "alive-src": "alive",
        "dead-src": "dead",
        "paused-src": "paused",
        "dormant-src": "behavioral-dormant",
        "uninstrumented-src": "uninstrumented",
    }
    assert set(states.values()) == RENDER_STATES  # exactly the five, no sixth


def test_behavioral_dormant_never_resolves_to_dead(migrated: sqlite3.Connection) -> None:
    """Dormancy is silence, not failure (law 4 vs law 5): a behavioral source
    gone quiet for a month — and even one paused by a human — never lands in
    the dead tier; dead comes only from source.status = dead."""
    silent = (datetime.now(UTC) - timedelta(days=45)).date().isoformat()

    dormant_id = _source(migrated, "quiet-behavioral", source_class="behavioral")
    _read_event(migrated, dormant_id, content_date=silent, ok=1)

    paused_id = _source(migrated, "paused-behavioral", source_class="behavioral")
    insert_event(
        migrated,
        kind="job_paused",
        origin="app-write",
        source_id=paused_id,
        external_ref="pause-1",
        actor="human",
        payload={},
    )

    states = {
        str(row["source_name"]): derive_render_state(row)
        for row in migrated.execute("SELECT * FROM coverage").fetchall()
    }
    assert states["quiet-behavioral"] == "behavioral-dormant"
    assert states["paused-behavioral"] == "paused"
    assert "dead" not in states.values()


def test_dead_takes_precedence_over_uninstrumented(migrated: sqlite3.Connection) -> None:
    """Dead is declared system failure: it outranks a zero-artifact history."""
    _source(migrated, "dead-never-ran", status="dead")
    row = migrated.execute("SELECT * FROM coverage").fetchone()
    assert row is not None
    assert row["artifact_count"] == 0
    assert derive_render_state(row) == "dead"


# --- db_path -----------------------------------------------------------------


def test_db_path_env_override(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("EUDAIMONIA_DB", str(tmp_path / "custom.db"))
    assert db_path() == tmp_path / "custom.db"
    monkeypatch.delenv("EUDAIMONIA_DB", raising=False)
    assert db_path() == REPO_ROOT / "eudaimonia.db"
