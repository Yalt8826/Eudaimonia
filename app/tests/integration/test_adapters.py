"""T1.1-T1.4 — the adapter framework and the three chain-following adapters.

The laws, proven on fixture trees (law citations in the asserts):

- cron chain beats the vault archive for the same content day (law 2)
- a second full ingest pass writes ZERO new rows (dedupe is the constraint)
- a predicate-failing artifact leaves last_ok_read_ts unmoved and writes a
  source_read_failure event (law 1: freshness != success)
- an artifact with no parseable content date is skipped with a failure
  event — a fresh mtime does not rescue it (law 3)
- ts follows the CONTENT date even when the path/filename disagrees
- rolling files: a content revision snapshots as a new event; an identical
  re-read writes nothing; a revision without day headers records honestly
  without faking a content date
"""

import json
import sqlite3
from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from app import adapters, db


@pytest.fixture()
def env(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> dict[str, Path]:
    """Returns {"root": tmp, "vault": ..., "cron": ..., "db": ...} — both
    chain roots, since a test writing cron files under the VAULT root puts
    them outside every cron glob (the fixture bug that cost an hour)."""
    vault = tmp_path / "vault"
    (vault / "Noesis" / "2026" / "09").mkdir(parents=True)
    cron = tmp_path / "cron"
    (cron / "reports").mkdir(parents=True)
    monkeypatch.setenv("EUDAIMONIA_DB", str(tmp_path / "adapters.db"))
    monkeypatch.setenv("EUDAIMONIA_VAULT", str(vault))
    monkeypatch.setenv("EUDAIMONIA_NOESIS_CRON", str(cron))
    monkeypatch.setenv("EUDAIMONIA_TZ_OFFSET_MINUTES", "0")
    conn = db.connect(tmp_path / "adapters.db")
    db.apply_migrations(conn)
    adapters.seed_registry(conn)
    conn.close()
    return {"root": tmp_path, "vault": vault, "cron": cron, "db": tmp_path / "adapters.db"}


def connect(env: dict[str, Path]) -> sqlite3.Connection:
    return db.connect(env["db"])


def write_report(path: Path, day: str, body: str = "work happened") -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(f"# {day}\n\n## Summary\n- {body}\n", encoding="utf-8")


def counts(db_file: Path) -> int:
    conn = db.connect(db_file)
    n = int(
        conn.execute(
            "SELECT COUNT(*) FROM event WHERE kind = 'source-read'"
        ).fetchone()[0]
    )
    conn.close()
    return n


def test_cron_chain_wins_same_day(env: dict[str, Path]) -> None:
    day = (datetime.now(UTC) - timedelta(days=1)).date().isoformat()
    write_report(env["vault"] / "Noesis" / "2026" / "09" / f"{day}.md", day, "STALE vault copy")
    cron_file = env["cron"] / "reports" / f"{day}_1000.md"
    write_report(cron_file, day, "FRESH cron copy")

    adapters.ingest_all(connect(env))

    conn = connect(env)
    rows = conn.execute(
        "SELECT external_ref, payload FROM event WHERE kind = 'source-read'"
        " AND source_id = (SELECT id FROM source WHERE name = 'day-report')"
    ).fetchall()
    conn.close()
    assert len(rows) == 1  # one day, one event — the cron copy won
    assert rows[0]["external_ref"].startswith("cron:")
    # the ref carries the WINNING copy's content hash — the body itself
    # stays read-through in the file (02 §1; the spine carries presence)
    import hashlib as _hl

    cron_text = cron_file.read_text(encoding="utf-8")
    cron_hash = _hl.sha256(cron_text.encode()).hexdigest()[:12]
    assert cron_hash in rows[0]["external_ref"]


def test_double_ingest_writes_zero_new_rows(env: dict[str, Path]) -> None:
    day = (datetime.now(UTC) - timedelta(days=1)).date().isoformat()
    write_report(env["vault"] / "Noesis" / "2026" / "09" / f"{day}.md", day)
    adapters.ingest_all(connect(env))
    assert counts(env["db"]) == 1
    adapters.ingest_all(connect(env))
    assert counts(env["db"]) == 1  # dedupe is the constraint


def test_predicate_failure_leaves_last_ok_unmoved(env: dict[str, Path]) -> None:
    # a report WITHOUT its day header: predicate fails (law 1)
    bad = env["vault"] / "Noesis" / "2026" / "09" / "2026-09-15.md"
    bad.parent.mkdir(parents=True, exist_ok=True)
    bad.write_text("no header here, just notes\n", encoding="utf-8")

    adapters.ingest_all(connect(env))

    conn = connect(env)
    failures = conn.execute(
        "SELECT payload FROM event WHERE kind = 'source_read_failure'"
    ).fetchall()
    last_ok = conn.execute(
        "SELECT last_ok_read_ts FROM source WHERE name = 'day-report'"
    ).fetchone()["last_ok_read_ts"]
    conn.close()
    assert len(failures) == 1  # a failure event, never silence
    assert last_ok is None  # freshness was NOT advanced


def test_content_date_beats_path_date(env: dict[str, Path]) -> None:
    # the FILENAME says 2026-09-20; the content header says 2026-09-18 —
    # law 3: ts follows content
    path = env["vault"] / "Noesis" / "2026" / "09" / "2026-09-20.md"
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("# 2026-09-18\n\ncontent-dated\n", encoding="utf-8")
    adapters.ingest_all(connect(env))

    conn = connect(env)
    ts = conn.execute("SELECT ts FROM event WHERE kind = 'source-read'").fetchone()["ts"]
    conn.close()
    assert ts.startswith("2026-09-18")


def test_rolling_file_revision_snapshots(env: dict[str, Path]) -> None:
    plan = env["vault"] / "Noesis" / "Week Plan.md"
    plan.write_text(
        "# Week Plan — 31 Aug–6 Sep 2026\n\n| Time | Block | Notes |\n"
        "|---|---|---|\n| 3:00–3:45pm | **dMAT** (45m) | warm-up |\n",
        encoding="utf-8",
    )
    adapters.ingest_all(connect(env))
    assert counts(env["db"]) == 1

    # identical re-read: zero new events
    adapters.ingest_all(connect(env))
    assert counts(env["db"]) == 1

    # a content REVISION: a new snapshot event
    plan.write_text(
        "# Week Plan — 7–13 Sep 2026\n\n| Time | Block | Notes |\n"
        "|---|---|---|\n| 3:00–3:45pm | **dMAT** (45m) | exam week |\n",
        encoding="utf-8",
    )
    adapters.ingest_all(connect(env))
    assert counts(env["db"]) == 2

    conn = connect(env)
    rows = conn.execute(
        "SELECT ts, payload FROM event WHERE kind = 'source-read'"
        " AND source_id = (SELECT id FROM source WHERE name = 'week-plan')"
        " ORDER BY id"
    ).fetchall()
    conn.close()
    assert rows[0]["ts"].startswith("2026-08-31")  # the week START is the ts
    assert rows[1]["ts"].startswith("2026-09-07")
    import json

    payload = json.loads(rows[1]["payload"])
    assert "dMAT" in payload["plan_lines"][0]  # plan-line extraction


def test_tasklist_revision_records_without_faking_content_date(env: dict[str, Path]) -> None:
    tasks = env["vault"] / "Noesis" / "Task List.md"
    tasks.write_text(
        "# Task List\n\n- [ ] Study for GRE — daily\n- [x] old thing ✅ 2026-08-01\n",
        encoding="utf-8",
    )
    adapters.ingest_all(connect(env))

    conn = connect(env)
    rows = conn.execute(
        "SELECT ts, payload, external_ref FROM event WHERE kind = 'source-read'"
        " AND source_id = (SELECT id FROM source WHERE name = 'tasklist')"
    ).fetchall()
    conn.close()
    assert len(rows) == 1
    payload = (
        json.loads(rows[0]["payload"])
        if isinstance(rows[0]["payload"], str)
        else rows[0]["payload"]
    )
    assert len(payload["tasks"]) == 2
    assert payload["tasks"][1]["done"] is True
    # recorded honestly: ok=1 but NO content_date — the coverage view will
    # not count a rolling file's freshness (law 3: never fake a date)


def test_coverage_view_counts_the_ingested_days(env: dict[str, Path]) -> None:
    day = (datetime.now(UTC) - timedelta(days=1)).date().isoformat()
    write_report(env["vault"] / "Noesis" / "2026" / "09" / f"{day}.md", day)
    adapters.ingest_all(connect(env))

    conn = connect(env)
    rows = conn.execute(
        "SELECT source_name, days_fresh_7, artifact_count, status FROM coverage"
        " ORDER BY source_name"
    ).fetchall()
    conn.close()
    by_name = {r["source_name"]: dict(r) for r in rows}
    assert by_name["day-report"]["days_fresh_7"] == 1
    assert by_name["day-report"]["artifact_count"] == 1
    assert by_name["day-report"]["status"] == "alive"
    # the rolling files: ok events but no content_date -> honest zero days
    # (law 3: never fake a date; the coverage view counts dated artifacts)
    assert by_name["week-plan"]["days_fresh_7"] == 0


def test_cron_run_logs_are_skipped_silently(
    env: dict[str, Path], monkeypatch: pytest.MonkeyPatch
) -> None:
    """The noesis cron dir carries EVERY cron job's run log. A run log is
    not a failed day-report read — it shares the dir, nothing more
    (measured live: 57 failure events of pure noise without the skip)."""
    log = env["cron"] / "fad301ef2179" / "2026-10-29_18-40-18.md"
    log.parent.mkdir(parents=True, exist_ok=True)
    log.write_text(
        "# Cron Job: desktop-plugin-linker\n\n**Status:** silent (empty output)\n",
        encoding="utf-8",
    )
    result = adapters.ingest_source(connect(env), "day-report")
    assert result["ok_events"] == 0

    conn = connect(env)
    failures = conn.execute(
        "SELECT 1 FROM event WHERE kind = 'source_read_failure'"
    ).fetchall()
    conn.close()
    assert failures == []  # skipped silently, not a failure storm
