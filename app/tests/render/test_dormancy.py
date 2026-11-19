"""T3.4 — the dormancy engine's contract (the structural gate).

One module decides how alive a source is; strips render its output. The
tests below drive the class-keyed tenancy through its whole table:
behavioral 13/14-day demotion + automatic re-earn, pipeline silence +
instant re-earn, paused suppression (law 4), the fifth state, the
never-red invariant (02 §6), and the one-module structural assert.
"""

from datetime import date, timedelta
from pathlib import Path
from typing import Any
import json
import sqlite3

import pytest

from app import coverage
from app import db

TODAY = date(2026, 11, 19)


def make_source(tmp_path: Path, name: str, klass: str) -> Path:
    db_file = tmp_path / "dormancy.db"
    conn = db.connect(db_file)
    db.apply_migrations(conn)
    conn.execute(
        "INSERT OR IGNORE INTO source (name, globs, class, success_predicate, status, ts)"
        " VALUES (?, '[]', ?, 'pred', 'alive', '2026-01-01T00:00:00+00:00')",
        (name, klass),
    )
    conn.commit()
    conn.close()
    return db_file


def read_event(db_file: Path, name: str, content_date: str | None) -> None:
    """A passing read, mirroring the real ingest: the event lands AND the
    source row's last_ok_read_ts advances to the read's wall time."""
    conn = db.connect(db_file)
    sid = conn.execute("SELECT id FROM source WHERE name = ?", (name,)).fetchone()[0]
    wall = (content_date or "2026-11-19")
    payload: dict[str, Any] = {"ok": 1}
    if content_date is not None:
        payload["content_date"] = content_date
    conn.execute(
        "INSERT INTO event (ts, kind, origin, source_id, external_ref, actor, payload)"
        " VALUES (?, 'source-read', 'source-read', ?, ?, 'system', ?)",
        (
            wall + "T00:00:00+00:00",
            sid,
            f"read:{content_date}",
            json.dumps(payload),
        ),
    )
    conn.execute(
        "UPDATE source SET last_ok_read_ts = ? WHERE id = ?"
        " AND (last_ok_read_ts IS NULL OR last_ok_read_ts < ?)",
        (wall + "T00:00:00+00:00", sid, wall + "T00:00:00+00:00"),
    )
    conn.commit()
    conn.close()


def pause(db_file: Path, name: str) -> None:
    conn = db.connect(db_file)
    sid = conn.execute("SELECT id FROM source WHERE name = ?", (name,)).fetchone()[0]
    conn.execute(
        "INSERT INTO event (ts, kind, origin, source_id, external_ref, actor, payload)"
        " VALUES ('2026-10-09T00:00:00+00:00', 'job_paused', 'app-write', ?, ?, 'human', '{}')",
        (sid, f"{name}:job_paused"),
    )
    conn.commit()
    conn.close()


def evaluate(db_file: Path, name: str, today: date = TODAY) -> dict[str, Any]:
    conn = db.connect(db_file)
    conn.row_factory = sqlite3.Row
    row = conn.execute("SELECT * FROM coverage WHERE source_name = ?", (name,)).fetchone()
    assert row is not None, f"{name} missing from the coverage view"
    result = coverage.evaluate(conn, row, today)
    conn.close()
    return result


def test_behavioral_13_active_14_demoted_then_re_earned(tmp_path: Path) -> None:
    name = "hygeia-meals"
    db_file = make_source(tmp_path, name, "behavioral")

    # last logged day 13 days ago: inside the silence threshold — active
    read_event(db_file, name, (TODAY - timedelta(days=13)).isoformat())
    assert evaluate(db_file, name)["state"] == "alive"

    # the same read is now 14 days old: demoted, muted, remediation hint —
    # automatic, no human actor anywhere in the path
    result = evaluate(db_file, name, TODAY + timedelta(days=1))
    assert result["state"] == "behavioral-dormant"
    assert result["tier"] == "muted"
    assert result["hint"] == "log a day to re-earn"

    # re-earn: 3 fresh content days in the trailing 7 flip it back — automatic
    for offset in (0, 1, 2):
        read_event(
            db_file,
            name,
            (TODAY + timedelta(days=1) - timedelta(days=offset)).isoformat(),
        )
    result = evaluate(db_file, name, TODAY + timedelta(days=1))
    assert result["state"] == "alive"
    assert result["tier"] == "normal"


def test_demoted_behavioral_never_carries_the_dead_hue(tmp_path: Path) -> None:
    name = "hygeia-meals"
    db_file = make_source(tmp_path, name, "behavioral")
    read_event(db_file, name, (TODAY - timedelta(days=40)).isoformat())
    result = evaluate(db_file, name)
    assert result["state"] == "behavioral-dormant"
    assert result["tier"] == "muted"
    # 02 §6: muted-never-red — red is system failure a human must fix,
    # and a lapsed food log is not one
    assert result["tier"] != "red"
    assert result["state"] != "dead"


def test_pipeline_silent_demoted_one_pass_re_earns(tmp_path: Path) -> None:
    name = "some-cron-source"
    db_file = make_source(tmp_path, name, "pipeline")

    # one passing read, then silence for 2 days → demoted
    read_event(db_file, name, (TODAY - timedelta(days=2)).isoformat())
    result = evaluate(db_file, name)
    assert result["state"] == "demoted"
    assert result["tier"] == "muted"
    assert result["hint"] == "repair the chain — one pass re-earns"

    # ONE pass on the same read cycle → alive again, instant
    read_event(db_file, name, TODAY.isoformat())
    assert evaluate(db_file, name)["state"] == "alive"


def test_paused_is_amber_with_actor_and_suppresses_tenancy(tmp_path: Path) -> None:
    name = "zetesis-digest"
    db_file = make_source(tmp_path, name, "pipeline")
    pause(db_file, name)

    result = evaluate(db_file, name)
    assert result["state"] == "paused"
    assert result["tier"] == "amber"
    # tenancy suppressed: even with ZERO fresh reads the source never
    # demotes out of paused (law 4 — only the human un-pauses)
    assert result["state"] != "demoted"
    assert result["state"] != "behavioral-dormant"


def test_zero_artifacts_is_uninstrumented(tmp_path: Path) -> None:
    name = "email"  # a pre-P3 source: registered, never fed
    db_file = make_source(tmp_path, name, "pipeline")
    result = evaluate(db_file, name)
    assert result["state"] == "uninstrumented"
    assert result["tier"] == "muted"
    assert result["hint"] == "not yet instrumented"


def test_structural_gate_one_module(tmp_path: Path) -> None:
    # the grep-enforced rule: tenancy logic exists in exactly one module.
    # Reading (pipeline) and nutrition (behavioral) demote THROUGH it —
    # their source rows carry the classes; no other module names the
    # states or thresholds.
    root = Path(__file__).resolve().parents[2]
    offenders = []
    for py in (root / "app" / "app").rglob("*.py"):
        if py.name == "coverage.py":
            continue
        text = py.read_text(encoding="utf-8")
        lowered = text.lower()
        if "behavioral-dormant" in lowered or "behavioral_silence_days" in lowered or "re-earn" in lowered:
            offenders.append(py.name)
    assert offenders == [], f"tenancy logic leaked out of coverage.py: {offenders}"


def test_demoted_nutrition_renders_the_dry_run_line(tmp_path: Path) -> None:
    # the W37 dry-run's render, now live: the engine supplies every piece
    # of 'meals · 0 of 7 · last logged Aug 16 · log a day to re-earn'
    name = "hygeia-meals"
    db_file = make_source(tmp_path, name, "behavioral")
    read_event(db_file, name, "2026-08-16")
    result = evaluate(db_file, name, TODAY)
    assert result["days_fresh_7"] == 0
    assert result["last_content_date"] == "2026-08-16"
    assert result["hint"] == "log a day to re-earn"
    line = f"meals · {result['days_fresh_7']} of 7 · last logged 2026-08-16 · {result['hint']}"
    assert line == "meals · 0 of 7 · last logged 2026-08-16 · log a day to re-earn"
