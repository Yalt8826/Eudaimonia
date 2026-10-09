"""SQLite access and the forward-only migration runner (T0.2).

No ORM, no new dependencies: the sqlite3 stdlib driver only, hand-written
SQL in app/migrations/*.sql. The database is one file, eudaimonia.db.

Migration contract (EXECUTION §2): forward-only. There is no down path,
here or anywhere — a rollback leaves a newer empty table behind, which
costs nothing.
"""

from __future__ import annotations

import json
import os
import sqlite3
from datetime import UTC, datetime
from pathlib import Path

MIGRATIONS_DIR = Path(__file__).resolve().parent.parent / "migrations"
"""Default migrations directory (<repo>/app/migrations)."""

_REPO_ROOT = Path(__file__).resolve().parents[2]

_SCHEMA_MIGRATIONS_DDL = (
    "CREATE TABLE IF NOT EXISTS schema_migrations ("
    " version TEXT PRIMARY KEY, applied_at TEXT NOT NULL)"
)


def db_path() -> Path:
    """Database file location: $EUDAIMONIA_DB wins, else <repo root>/eudaimonia.db."""
    env = os.environ.get("EUDAIMONIA_DB")
    if env:
        return Path(env)
    return _REPO_ROOT / "eudaimonia.db"


def connect(path: str | Path) -> sqlite3.Connection:
    """Open the database with the project-wide connection shape.

    Rows come back as sqlite3.Row and foreign-key enforcement is ON — the
    spine references source(id) and assignment references event(id).
    """
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def utc_now_iso() -> str:
    """Current UTC time as ISO8601 text — the ts convention for every table."""
    return datetime.now(UTC).isoformat()


def insert_event(
    conn: sqlite3.Connection,
    *,
    kind: str,
    origin: str,
    source_id: int | None,
    external_ref: str,
    actor: str,
    payload: dict[str, object],
    ts: str | None = None,
) -> int:
    """Append one event to the spine with a PLAIN INSERT.

    No silent dedupe here: a duplicate (source_id, kind, external_ref) raises
    sqlite3.IntegrityError. Callers that need replay-dedupe issue their own
    INSERT OR IGNORE and treat a 0 rowcount as already-seen (02 §1 — the
    unique constraint is the one idempotency gate).
    """
    event_ts = ts if ts is not None else utc_now_iso()
    cursor = conn.execute(
        "INSERT INTO event (ts, kind, origin, source_id, external_ref, actor, payload)"
        " VALUES (?, ?, ?, ?, ?, ?, ?)",
        (event_ts, kind, origin, source_id, external_ref, actor, json.dumps(payload)),
    )
    rowid = cursor.lastrowid
    if rowid is None:
        msg = "INSERT INTO event produced no rowid"
        raise RuntimeError(msg)
    return rowid


def apply_migrations(
    conn: sqlite3.Connection, migrations_dir: str | Path | None = None
) -> list[str]:
    """Apply pending migrations, forward-only. Returns versions applied now.

    - Ensures schema_migrations(version TEXT PRIMARY KEY, applied_at TEXT).
    - Reads *.sql from migrations_dir in lexicographic order; a file version
      is its numeric filename prefix (001_initial.sql -> "001").
    - Refuses gaps: the first version must be 001 and every next version must
      sort immediately after the previous one — a missing middle file is an
      error, never a silent skip. Applied versions whose files disappeared
      from the directory are an error too.
    - Wraps each migration in exactly one transaction, with its
      schema_migrations row written inside that same transaction.
    - No-op when everything is already applied (returns []).
    """
    directory = Path(migrations_dir) if migrations_dir is not None else MIGRATIONS_DIR
    conn.execute(_SCHEMA_MIGRATIONS_DDL)

    applied_rows = conn.execute("SELECT version FROM schema_migrations").fetchall()
    applied = {str(row["version"]) for row in applied_rows}

    filenames = sorted(p.name for p in directory.glob("*.sql"))
    versions = [_version_of(name) for name in filenames]

    stale = applied - set(versions)
    if stale:
        msg = f"applied versions missing from {directory}: {sorted(stale)}"
        raise ValueError(msg)

    pending: list[tuple[str, str]] = []
    expected = 1
    for name, version in zip(filenames, versions, strict=True):
        if int(version) != expected:
            msg = (
                f"migration gap: {name!r} (version {version}) does not sort"
                f" immediately after version {expected - 1:03d} — the"
                " forward-only runner refuses gaps"
            )
            raise ValueError(msg)
        expected = int(version) + 1
        if version not in applied:
            pending.append((version, (directory / name).read_text(encoding="utf-8")))

    previously = conn.isolation_level
    conn.isolation_level = None  # manual transaction control for this scope
    applied_now: list[str] = []
    try:
        for version, script in pending:
            conn.execute("BEGIN IMMEDIATE")
            try:
                for statement in _statements(script):
                    conn.execute(statement)
                conn.execute(
                    "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)",
                    (version, utc_now_iso()),
                )
            except BaseException:
                conn.execute("ROLLBACK")
                raise
            conn.execute("COMMIT")
            applied_now.append(version)
    finally:
        conn.isolation_level = previously
    return applied_now


def _version_of(filename: str) -> str:
    """Numeric version prefix of a migration filename (001_initial.sql -> "001")."""
    stem = filename.removesuffix(".sql")
    version, sep, rest = stem.partition("_")
    if not sep or not version.isdigit() or not rest:
        msg = f"migration filename must look like NNN_name.sql, got {filename!r}"
        raise ValueError(msg)
    return version


def _statements(script: str) -> list[str]:
    """Split a script into complete, semicolon-terminated statements.

    Uses sqlite3.complete_statement so splitting is quote-aware. Migration
    files use only -- comments and never place quotes or semicolons inside
    them (see the 001 header), so a comment never hides a statement boundary.
    A trailing comment-only tail is dropped; an unterminated statement raises.
    """
    statements: list[str] = []
    buffer: list[str] = []
    for line in script.splitlines(keepends=True):
        buffer.append(line)
        if sqlite3.complete_statement("".join(buffer)):
            chunk = "".join(buffer).strip()
            if _has_sql(chunk):
                statements.append(chunk)
            buffer = []
    tail = "".join(buffer).strip()
    if tail and _has_sql(tail):
        msg = f"migration script ends with an unterminated statement: {tail[:60]!r}"
        raise ValueError(msg)
    return statements


def _has_sql(chunk: str) -> bool:
    """True if the chunk holds anything beyond -- comments and whitespace."""
    for line in chunk.splitlines():
        stripped = line.strip()
        if stripped and not stripped.startswith("--"):
            return True
    return False
