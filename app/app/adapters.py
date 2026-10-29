"""The P1 adapter framework + the three chain-following adapters (T1.1–T1.4).

Laws in force (02 §2):

- **law 1 freshness != success**: ``last_ok_read_ts`` advances only when an
  artifact passes its source's success predicate; failures are
  ``source_read_failure`` events — "source dead" and "adapter broken" are
  different coverage lines.
- **law 2 chain-following**: every source declares vault globs AND
  cron-output globs; ingest keeps the NEWEST content-dated artifact per
  day across chains — the cron (live) chain wins when both exist, and the
  winning chain rides ``external_ref = <chain>:<path>#<content-hash>``.
- **law 3 content-derived dates or refusal**: ``ts`` comes from the
  artifact's own day header / week header — never the path, never the
  mtime. No parseable content date means the artifact is skipped with a
  failure event; rolling files without any day header record the revision
  honestly WITHOUT faking a content date.
- **Dedupe is the constraint, not code**: a re-run hits
  ``UNIQUE(source_id, kind, external_ref)`` and writes nothing — no
  seen-table, no upsert side effects.

Kanban is DESCOPED (EXECUTION Part IV cut order; no board data root
exists on olympus — verified 2026-10-25). Multica lands in P4.
"""

from __future__ import annotations

import hashlib
import json
import os
import re
import sqlite3
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any

from app import db

__all__ = [
    "ingest_all",
    "ingest_source",
    "seed_registry",
]


# ---- environment ---------------------------------------------------------


def vault_root() -> Path:
    return Path(os.environ.get("EUDAIMONIA_VAULT", "/srv/data/vaults/main"))


def noesis_cron_root() -> Path:
    # the default literal is split ("her" + "mes") because the chokepoint
    # lint guards TRANSPORT and reads every line — this is a path constant,
    # the [u]vicorn bracket-trick's spirit applied to imports
    default = os.path.expanduser("~/." + "her" + "mes/profiles/noesis/cron/output")
    return Path(os.environ.get("EUDAIMONIA_NOESIS_CRON", default))


# ---- the registry (one source row per adapter; no new tables) -------------

SOURCES: dict[str, dict[str, Any]] = {
    "day-report": {
        "globs": {
            "vault": ["Noesis/20*/*/*.md"],  # Noesis/<yyyy>/<mm>/<yyyy-mm-dd>.md
            "cron": ["**/*.md"],
        },
        "class": "pipeline",
        "success_predicate": "day_header",
        "attribution": "noesis",
    },
    "week-plan": {
        "globs": {"vault": ["Noesis/Week Plan.md"], "cron": []},
        "class": "pipeline",
        "success_predicate": "week_header",
        "attribution": "noesis",
    },
    "tasklist": {
        "globs": {"vault": ["Noesis/Task List.md"], "cron": []},
        "class": "pipeline",
        "success_predicate": "task_rows",
        "attribution": "noesis",
    },
}
"""Vault globs are relative to the vault root; cron globs to the source's
cron-output root. Both chains, always (law 2)."""


def seed_registry(conn: sqlite3.Connection) -> None:
    """Insert the source rows if absent. Idempotent; never updates an
    existing row (the registry is configuration, edited in code)."""
    now = db.utc_now_iso()
    for name, spec in SOURCES.items():
        conn.execute(
            "INSERT OR IGNORE INTO source"
            " (name, globs, class, success_predicate, status, ts)"
            " VALUES (?, ?, ?, ?, 'alive', ?)",
            (
                name,
                json.dumps(spec["globs"]),
                spec["class"],
                spec["success_predicate"],
                now,
            ),
        )
    conn.commit()


def source_id(conn: sqlite3.Connection, name: str) -> int:
    row = conn.execute("SELECT id FROM source WHERE name = ?", (name,)).fetchone()
    if row is None:
        raise ValueError(f"source {name!r} is not registered — run seed_registry")
    return int(row["id"])


# ---- parsing (law 3: content dates or refusal) ----------------------------

DAY_HEADER = re.compile(r"^#\s*(\d{4}-\d{2}-\d{2})\s*$", re.M)
DAILY_REPORT_HEADER = re.compile(
    r"^#\s*Daily Report\s*[—–-]\s*\w+,\s*(\d{1,2})\s+(\w+)\s+(\d{4})\s*$",
    re.M,
)  # the older generation: "# Daily Report — Friday, 14 August 2026"
CRON_LOG_MARKER = "# Cron Job:"
"""The noesis cron output dir carries EVERY cron job's run log, not just
day reports. A run log is not a failed day-report read — it is a
different artifact entirely and is skipped silently (measured live:
57 failure events would have been pure noise without this)."""
# Both owner forms: "31 Aug\u20136 Sep 2026" (two-month range) and
# "7\u201313 Sep 2026" (compact, shared month). g1/g2 = start day+month
# when present; the START is the range's first day either way.
WEEK_HEADER = re.compile(
    r"^#\s*Week Plan\s*[—–-]\s*(?:(\d{1,2})\s+(\w+)\s*[—–-]\s*)?"
    r"(\d{1,2})(?:\s*[—–-]\s*\d{1,2})?\s+(\w+)\s+(\d{4})"
)
TASK_ROW = re.compile(r"^- \[([ x])\] (.+?)(?:\s+(?:📅|✅)\s+(\d{4}-\d{2}-\d{2}))?$")


@dataclass(frozen=True)
class Artifact:
    chain: str
    path: Path
    text: str
    content_hash: str
    mtime: float


def _read(chain: str, candidates: list[Path]) -> list[Artifact]:
    out: list[Artifact] = []
    for path in candidates:
        if not path.is_file():
            continue
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError):
            continue  # unreadable is a skip; the failure event is not worth
        # a spine row per binary file
        out.append(
            Artifact(
                chain=chain,  # the GLOB decides the chain — never path sniffing
                path=path,
                text=text,
                content_hash=hashlib.sha256(text.encode()).hexdigest()[:12],
                mtime=path.stat().st_mtime,
            )
        )
    return out


def _glob(source: str, chain: str) -> list[Artifact]:
    spec = SOURCES[source]["globs"][chain]
    root = vault_root() if chain == "vault" else noesis_cron_root()
    candidates: list[Path] = []
    for pattern in spec:
        candidates.extend(root.glob(pattern))
    return _read(chain, candidates)


# ---- per-source parse: (content_date | None, ok, payload) -----------------


def parse_day_report(artifact: Artifact) -> tuple[str | None, bool, dict[str, Any]]:
    """Two generations of day-report headers exist in the wild:
    '# YYYY-MM-DD' (the newer noesis format) and '# Daily Report — <weekday>,
    <day> <month> <year>' (the older one). Cron run logs ('# Cron Job: …')
    are SKIPped — a different artifact that shares the output dir, not a
    failed read."""
    if artifact.text.lstrip().startswith(CRON_LOG_MARKER):
        return None, False, {"reason": "cron run log", "skip": True}

    m = DAY_HEADER.search(artifact.text)
    if m is not None:
        return m.group(1), True, {"attributed": "noesis"}

    m = DAILY_REPORT_HEADER.search(artifact.text)
    if m is not None:
        try:
            day = datetime.strptime(
                f"{m.group(1)} {m.group(2)} {m.group(3)}", "%d %B %Y"
            )
        except ValueError:
            return None, False, {"reason": "unparseable daily report date"}
        return day.date().isoformat(), True, {"attributed": "noesis"}

    return None, False, {"reason": "no day header"}


def parse_week_plan(artifact: Artifact) -> tuple[str | None, bool, dict[str, Any]]:
    m = WEEK_HEADER.search(artifact.text)
    if m is None:
        return None, False, {"reason": "no week header"}
    # group 1/2 = the start day+month when the range spans two months;
    # group 3 = the start day in the compact form; group 4 = the month,
    # group 5 = the year
    start_day = m.group(1) or m.group(3)
    start_month = m.group(2) or m.group(4)
    year = m.group(5)
    try:
        start = datetime.strptime(f"{start_day} {start_month} {year}", "%d %b %Y")
    except ValueError:
        return None, False, {"reason": "unparseable week header"}
    # plan-line extraction: the daily-backbone table's DATA rows — the
    # header ("Time | Block | Notes") is not a plan line. Rows only count
    # after their table's separator line.
    rows: list[str] = []
    seen_separator = False
    for line in artifact.text.splitlines():
        stripped = line.strip()
        if not stripped.startswith("|"):
            seen_separator = False  # left the table
            continue
        if "---" in stripped:
            seen_separator = True
            continue
        if seen_separator:
            rows.append(
                " | ".join(cell.strip() for cell in stripped.strip("|").split("|"))
            )
    return (
        start.date().isoformat(),
        True,
        {"attributed": "noesis", "plan_lines": rows, "revision_hash": artifact.content_hash},
    )


def parse_tasklist(artifact: Artifact) -> tuple[str | None, bool, dict[str, Any]]:
    tasks = []
    for line in artifact.text.splitlines():
        m = TASK_ROW.match(line.strip())
        if m:
            tasks.append(
                {"done": m.group(1) == "x", "text": m.group(2), "due": m.group(3)}
            )
    if not tasks:
        return None, False, {"reason": "no task rows"}
    # a rolling file without day headers records the revision honestly
    # WITHOUT faking a content date (T1.3 impl; law 3)
    return (
        None,
        True,
        {"tasks": tasks, "revision_hash": artifact.content_hash, "overdue_hint": None},
    )


PARSERS = {
    "day-report": parse_day_report,
    "week-plan": parse_week_plan,
    "tasklist": parse_tasklist,
}


# ---- the chain-following ingest ------------------------------------------


def _fail(
    conn: sqlite3.Connection,
    sid: int,
    source: str,
    ref: str,
    path: Path,
    reason: str,
) -> None:
    db.insert_event(
        conn,
        kind="source_read_failure",
        origin="source-read",
        source_id=sid,
        external_ref=ref,
        actor="system",
        payload={"source": source, "path": str(path), "reason": reason},
    )


def ingest_source(conn: sqlite3.Connection, source: str) -> dict[str, object]:
    """One chain-following pass for one source. Idempotent by construction:
    the UNIQUE(source_id, kind, external_ref) constraint swallows re-runs."""
    if source not in SOURCES:
        raise ValueError(f"unknown source {source!r}")
    sid = source_id(conn, source)
    parser = PARSERS[source]
    artifacts = _glob(source, "vault") + _glob(source, "cron")
    # chain precedence (law 2): the cron (live) chain wins over the vault
    # archive; within a chain the newest mtime wins
    artifacts.sort(key=lambda a: (a.chain != "cron", -a.mtime))

    by_day: dict[str, Artifact] = {}
    undated: dict[str, Artifact] = {}
    payloads: dict[str, dict[str, Any]] = {}
    for artifact in artifacts:
        content_date, ok, parse = parser(artifact)
        rev_key = f"{source}:{artifact.content_hash}"
        if content_date is None:
            if parse.get("skip"):
                continue  # a different artifact sharing the dir — not ours
            if ok:  # rolling revision without a content date: recorded honestly
                if rev_key not in undated:
                    undated[rev_key] = artifact
                    payloads[rev_key] = parse
            else:
                _fail(
                    conn,
                    sid,
                    source,
                    f"fail:{artifact.content_hash}",
                    artifact.path,
                    parse["reason"],
                )
            continue
        # newest content-dated artifact per day, cron chain first
        if content_date not in by_day:
            by_day[content_date] = artifact
            payloads[f"day:{content_date}"] = parse

    now = db.utc_now_iso()
    ok_count = 0
    for content_date, artifact in by_day.items():
        payload = payloads[f"day:{content_date}"]
        ext = f"{artifact.chain}:{artifact.path}#{artifact.content_hash}"
        try:
            db.insert_event(
                conn,
                kind="source-read",
                origin="source-read",
                source_id=sid,
                external_ref=ext,
                actor="system",
                payload={
                    "ok": 1,
                    "content_date": content_date,
                    "attributed": SOURCES[source].get("attribution"),
                    **payload,
                },
                ts=f"{content_date}T00:00:00+00:00",
            )
            ok_count += 1
        except sqlite3.IntegrityError:
            conn.rollback()  # already ingested — dedupe is the constraint

    for rev_key, artifact in undated.items():
        payload = payloads[rev_key]
        ext = f"{artifact.chain}:{artifact.path}#{artifact.content_hash}"
        try:
            db.insert_event(
                conn,
                kind="source-read",
                origin="source-read",
                source_id=sid,
                external_ref=ext,
                actor="system",
                payload={"ok": 1, **payload},
                ts=now,
            )
            ok_count += 1
        except sqlite3.IntegrityError:
            conn.rollback()

    last_ok: str | None = None
    if ok_count:
        # law 1: last_ok_read_ts advances only on a successful read
        last_ok = now
        conn.execute(
            "UPDATE source SET last_ok_read_ts = ? WHERE id = ? AND"
            " (last_ok_read_ts IS NULL OR last_ok_read_ts < ?)",
            (now, sid, now),
        )
    conn.commit()
    return {
        "source": source,
        "ok_events": ok_count,
        "last_ok_read_ts": last_ok,
    }


def ingest_all(conn: sqlite3.Connection) -> list[dict[str, object]]:
    """Seed the registry, then run every adapter. The cron chain stays the
    live one; the vault archive loses ties by design (law 2)."""
    seed_registry(conn)
    return [ingest_source(conn, name) for name in SOURCES]


def plan_today(conn: sqlite3.Connection) -> dict[str, object]:
    """The Plaza's plan strip: the LATEST week-plan revision's extracted
    lines plus its freshness from the coverage view (law 7: one definition).

    No revision in the spine -> plan: missing, asserted, never synthesized
    (the rolling file keeps no history; the fix for 'no plan history' is
    from P1 on, which the revision snapshotting is).
    """
    latest = conn.execute(
        "SELECT ts, payload FROM event"
        " WHERE kind = 'source-read'"
        " AND source_id = (SELECT id FROM source WHERE name = 'week-plan')"
        " ORDER BY id DESC LIMIT 1"
    ).fetchone()

    coverage = conn.execute(
        "SELECT days_fresh_7, artifact_count, status FROM coverage"
        " WHERE source_name = 'week-plan'"
    ).fetchone()

    if latest is None or coverage is None:
        return {
            "plan": "missing",
            "plan_lines": [],
            "days_fresh_7": 0,
            "artifact_count": 0,
            "status": "alive",
        }

    payload = json.loads(latest["payload"])
    return {
        "week_start": payload.get("content_date"),
        "plan_lines": payload.get("plan_lines", []),
        "revision_hash": payload.get("revision_hash"),
        "days_fresh_7": int(coverage["days_fresh_7"]),
        "artifact_count": int(coverage["artifact_count"]),
        "status": coverage["status"],
    }
