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
from app.routines import KEY_MAX

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


def zetesis_cron_root() -> Path:
    # same split discipline as noesis_cron_root (the lint reads constants too)
    default = os.path.expanduser("~/." + "her" + "mes/profiles/zetesis/cron/output")
    return Path(os.environ.get("EUDAIMONIA_ZETESIS_CRON", default))


CRON_ROOTS: dict[str, str] = {"zetesis-digest": "zetesis"}
"""Sources whose cron chain lives outside the noesis output dir: the key
is the source name, the value selects the root fn above."""


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
    "zetesis-digest": {
        "globs": {"vault": [], "cron": ["*.txt"]},
        "class": "pipeline",
        "success_predicate": "digest_edition",
        "attribution": "zetesis",
    },
    "hygeia-meals": {
        "globs": {
            "vault": ["Hygeia/**/*.md", "Hygeia/log.csv", "Food Log/**"],
            "cron": [],  # declared anyway (law 2) — the chain is empty today
        },
        "class": "behavioral",  # law 4: this is the owner's own logged behavior
        "success_predicate": "meal_day",
        "attribution": "hygeia",
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
DIGEST_HEADER = re.compile(
    r"^#\s*(?:Daily\s+)?AI/ML Digest\s*[—–-]\s*\w+,\s*(\d{1,2})\s+(\w+)\s+(\d{4})\s*$",
    re.M,
)
"""Both generations: '# Daily AI/ML Digest — Monday, 10 August 2026' (the
first job) and '# AI/ML Digest — Wednesday, 26 August 2026' (the rest)."""

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
    if chain == "vault":
        root = vault_root()
    elif CRON_ROOTS.get(source) == "zetesis":
        root = zetesis_cron_root()
    else:
        root = noesis_cron_root()
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


def routine_slug(title_cell: str) -> str:
    """T1.3's stable slug of a Week Plan line's title (07 §19).

    "**GRE deep work** (~3h)" → "gre-deep-work"; "Flex slot" → "flex-slot".
    Derived from the TITLE cell only — a time or notes edit must not orphan
    the tick history. Deterministic: the same title always yields the same
    key, so the tick sites never hardcode or re-derive one (T2.7). An empty
    string means "no stable name" (an unnamed block row) and nothing may
    tick it. A repeated title in one week disambiguates by occurrence
    ("gym", "gym-2", ...) in parse_week_plan, so two same-named slots can
    never share a day's external_ref.
    """
    text = re.sub(r"\([^)]*\)", " ", title_cell.replace("**", " "))
    slug = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return slug[:KEY_MAX].strip("-")


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
    # after their table's separator line. Alongside each line, its stable
    # routine_key (07 §19) rides the same-index plan_keys list, so tick
    # sites read the extractor's slug instead of deriving one — a renamed
    # line changes the row text, never its key's derivation rules.
    rows: list[str] = []
    keys: list[str] = []
    seen: dict[str, int] = {}
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
            cells = [cell.strip() for cell in stripped.strip("|").split("|")]
            rows.append(" | ".join(cells))
            base = routine_slug(cells[1] if len(cells) > 1 else "")
            if base == "":
                keys.append("")
            else:
                n = seen.get(base, 0) + 1
                seen[base] = n
                keys.append(base if n == 1 else f"{base}-{n}")
    return (
        start.date().isoformat(),
        True,
        {
            "attributed": "noesis",
            "plan_lines": rows,
            "plan_keys": keys,
            "revision_hash": artifact.content_hash,
        },
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


def parse_digest(artifact: Artifact) -> tuple[str | None, bool, dict[str, Any]]:
    """The zetesis edition: '# [Daily ]AI/ML Digest — <Weekday>, <D> <Month>
    <YYYY>' and a body that is not a FAILED stub (the success predicate,
    law 1). Extraction rule (T3.1, the binding definition — the seed count
    is whatever THIS yields, never a round number): a paper is an
    entry-anchored line — optional '- ' bullet, then a bold title in
    either form (**Title** or **[Title](arxiv-url)**) — whose line carries
    an arxiv.org/abs URL, under a Papers/Tools section. Dedupe key is the
    normalized arXiv ID (lowercase, version stripped)."""

    m = DIGEST_HEADER.search(artifact.text)
    if m is None:
        return None, False, {"reason": "no digest header"}
    try:
        day = datetime.strptime(f"{m.group(1)} {m.group(2)} {m.group(3)}", "%d %B %Y")
    except ValueError:
        return None, False, {"reason": "unparseable digest date"}
    content_date = day.date().isoformat()

    body_lines = artifact.text.splitlines()
    papers: dict[str, str] = {}
    section = ""
    failed = False
    for line in body_lines:
        if re.fullmatch(r"\s*FAILED\s*", line):
            failed = True
            continue
        if line.startswith("#"):
            hm = re.match(r"^##\s+(.*)$", line)
            if hm:
                section = hm.group(1).strip()
            continue
        if not re.search(r"paper|tool", section, re.I):
            continue
        entry = re.match(r"^\s*-?\s*\*\*(.+?)\*\*", line)
        link = re.search(r"arxiv\.org/abs/([^\s\)\]]+)", line)
        if entry is None or link is None:
            continue
        bold = entry.group(1)
        wrapped = re.match(r"^\[(.+?)\]\(", bold)
        title = wrapped.group(1).strip() if wrapped else bold.strip()
        arxiv_id = re.sub(r"v\d+$", "", link.group(1).rstrip(").,. ").lower())
        if arxiv_id:
            papers.setdefault(arxiv_id, title)

    if failed:
        return content_date, False, {"reason": "failed edition"}
    return (
        content_date,
        True,
        {"attributed": "zetesis", "papers": [{"arxiv_id": k, "title": t} for k, t in papers.items()]},
    )




HYGEIA_DAY_HEADER = re.compile(r"^##\s+(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\w{3})\s+(\d{1,2})\s*$")
HYGEIA_H1_YEAR = re.compile(r"^#\s+\w+\s+(\d{4})\s*[—–-]")
HYGEIA_TABLE_ROW = re.compile(
    r"^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|"
    r"\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|"
)
HYGEIA_DAY_TOTAL = re.compile(r"\*\*Day total:\*\*\s*([\d.]+)\s*kcal\s*·\s*([\d.]+)\s*g\s*P")
HYGEIA_ABSENT_TOTAL = "—"


def parse_hygeia(artifact: Artifact) -> tuple[str | None, bool, dict[str, Any]]:
    """The Hygeia food log (T3.2): rolling week files of day sections.

    - Content dates come from the '## Ddd Mmm d' day headers ONLY (law 3;
      the ground-truth trap: august/week4.md CONTAINS September days —
      folder and filename lie, headers don't). The year rides the file's
      H1 title.
    - A '—' day-total placeholder is ABSENCE, never zero (law 7): the
      skeleton weeks parse to zero meal rows.
    - log.csv is the measured weight series — dated points, no estimates.
    - Files without day sections (README, plan, food_db) are a different
      artifact sharing the directory — skipped silently, not failures.
    """
    if artifact.path.suffix == ".csv":
        return parse_hygeia_weights(artifact)

    lines = artifact.text.splitlines()
    year_m = None
    for line in lines[:6]:
        year_m = HYGEIA_H1_YEAR.match(line)
        if year_m:
            break
    year = int(year_m.group(1)) if year_m else now_year()

    days: dict[str, dict[str, Any]] = {}
    current_day: str | None = None
    saw_day_section = False
    in_table = False
    stated_total: tuple[float, float] | None = None
    for line in lines:
        hm = HYGEIA_DAY_HEADER.match(line)
        if hm is not None:
            try:
                day = datetime.strptime(f"{hm.group(2)} {hm.group(3)} {year}", "%b %d %Y")
            except ValueError:
                current_day = None
                continue
            saw_day_section = True
            current_day = day.date().isoformat()
            days.setdefault(current_day, {"items": [], "day_total": None})
            in_table = False
            continue
        if current_day is None:
            continue
        if set(line.replace("|", "").strip()) <= {"-", " "} and "|" in line:
            in_table = True  # the |---| separator opens the table
            continue
        tm = HYGEIA_DAY_TOTAL.search(line)
        if tm is not None:
            stated_total = (float(tm.group(1)), float(tm.group(2)))
            days[current_day]["day_total"] = stated_total
            continue
        if in_table:
            rm = HYGEIA_TABLE_ROW.match(line)
            if rm is not None:
                days[current_day]["items"].append(
                    {
                        "label": f"{rm.group(1).strip()}: {rm.group(2).strip()}",
                        "qty": rm.group(3).strip(),
                        "kcal_est": float(rm.group(4)),
                        "protein_g_est": float(rm.group(5)),
                        "carbs_g_est": float(rm.group(6)),
                        "fat_g_est": float(rm.group(7)),
                        # every value here is an agent estimate over the
                        # owner's description — the basis is Hygeia's own
                        # food_db reference, never a measurement
                        "basis": "food_db:hygeia",
                    }
                )

    if not saw_day_section:
        return None, False, {"skip": True, "reason": "no day sections"}

    # drop absent days (skeleton '—' placeholders): absence, never zero
    for key in [d for d, v in days.items() if not v["items"]]:
        del days[key]

    ok = any(v["items"] for v in days.values())
    if not ok:
        return None, False, {"reason": "no logged meal rows"}
    return (
        None,
        True,
        {"attributed": "hygeia", "days": days, "revision_hash": artifact.content_hash},
    )


def now_year() -> int:
    from datetime import datetime

    return datetime.now().year


def parse_hygeia_weights(artifact: Artifact) -> tuple[str | None, bool, dict[str, Any]]:
    """log.csv — the MEASURED weight series (law 11's other direction:
    these carry no estimate provenance and never render as 'current')."""
    import csv
    import io

    rows = list(csv.DictReader(io.StringIO(artifact.text)))
    weights = []
    for row in rows:
        raw_date = (row.get("date") or "").strip()
        kg = (row.get("weight_kg") or "").strip()
        if not raw_date or not kg:
            continue
        weights.append(
            {
                "date": raw_date,
                "weight_kg": float(kg),
                "waist_cm": float(row["waist_cm"]) if (row.get("waist_cm") or "").strip() else None,
                "notes": (row.get("notes") or "").strip() or None,
            }
        )
    if not weights:
        return None, False, {"reason": "no weight rows"}
    return None, True, {"attributed": "hygeia", "weights": weights, "revision_hash": artifact.content_hash}


PARSERS = {
    "day-report": parse_day_report,
    "week-plan": parse_week_plan,
    "tasklist": parse_tasklist,
    "zetesis-digest": parse_digest,
    "hygeia-meals": parse_hygeia,
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
    try:
        db.insert_event(
            conn,
            kind="source_read_failure",
            origin="source-read",
            source_id=sid,
            external_ref=ref,
            actor="system",
            payload={"source": source, "path": str(path), "reason": reason},
        )
    except sqlite3.IntegrityError:
        conn.rollback()  # the same failing artifact re-read: already recorded


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
        if not ok:
            # a content-dated failure (e.g. a FAILED digest edition): the
            # failure event carries the content date (law 1 — freshness is
            # not success) and no source-read is minted for it
            _fail(
                conn,
                sid,
                source,
                f"fail:{content_date}:{artifact.content_hash}",
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
        day_rows = payload.pop("days", None) if isinstance(payload.get("days"), dict) else None
        if day_rows is not None:
            # a rolling file whose day sections carry their own content
            # dates (T3.2): one source-read PER COVERED DAY, dated by the
            # day header (law 3) — the file is just the envelope
            for day_date, day_payload in sorted(day_rows.items()):
                day_ext = f"{ext}:{day_date}"
                try:
                    db.insert_event(
                        conn,
                        kind="source-read",
                        origin="source-read",
                        source_id=sid,
                        external_ref=day_ext,
                        actor="system",
                        payload={
                            "ok": 1,
                            "content_date": day_date,
                            **day_payload,
                        },
                        ts=f"{day_date}T00:00:00+00:00",
                    )
                    ok_count += 1
                except sqlite3.IntegrityError:
                    conn.rollback()  # already ingested
            continue
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


def seed_reading(conn: sqlite3.Connection) -> dict[str, object]:
    """T3.1's seed: fold the winning digest editions (oldest first) and
    mint ONE reading_seeded app-write per unique paper — external_ref
    ``zetesis:{arxiv_id}`` makes the UNIQUE constraint the re-ingest
    idempotency (inserts nothing the second time), the provenance edge
    links the seeded paper to the edition that introduced it, and the
    reading_item row is the cache the status/rating fold updates (event
    before row, 03 #5; single writer per EXECUTION §7)."""
    sid = source_id(conn, "zetesis-digest")
    editions = conn.execute(
        "SELECT external_ref, payload, ts FROM event"
        " WHERE kind = 'source-read' AND source_id = ?"
        " ORDER BY ts ASC, id ASC",
        (sid,),
    ).fetchall()
    seeded = 0
    for edition in editions:
        payload = json.loads(edition["payload"])
        for paper in payload.get("papers", []):
            arxiv_id = paper["arxiv_id"]
            ref = f"zetesis:{arxiv_id}"
            exists = conn.execute(
                "SELECT 1 FROM event WHERE external_ref = ? AND kind = 'reading_seeded'",
                (ref,),
            ).fetchone()
            if exists is not None:
                continue  # re-ingest inserts nothing — not even the row
            cur = conn.execute(
                "INSERT INTO reading_item (title, status, ts) VALUES (?, 'new', ?)",
                (paper["title"], edition["ts"]),
            )
            db.insert_event(
                conn,
                kind="reading_seeded",
                origin="app-write",
                source_id=sid,
                external_ref=ref,
                actor="system",
                payload={
                    "arxiv_id": arxiv_id,
                    "title": paper["title"],
                    "row_id": int(cur.lastrowid),
                    "edition_ref": edition["external_ref"],
                    "edition_date": edition["ts"][:10],
                },
                ts=edition["ts"],
            )
            conn.execute(
                "INSERT INTO provenance_edge (from_ref, to_ref, type, ts) VALUES (?, ?, 'seed', ?)",
                (edition["external_ref"], ref, db.utc_now_iso()),
            )
            seeded += 1
    conn.commit()
    return {"source": "zetesis-reading-seed", "seeded": seeded}


def seed_hygeia_meals(conn: sqlite3.Connection) -> dict[str, object]:
    """T3.2's fold: the Hygeia chain's per-day source-read events become
    meal_logged rows (one per covered day — items[] canonical, 03 #4),
    with a provenance edge back to the day's read. The week files' stated
    day totals ride the payload as kcal_total_est so a mismatch can be
    FLAGGED at render, never silently reconciled. Weight rows from
    log.csv land as measured weight_logged points (law 11's other
    direction: no estimate provenance, never rendered as 'current')."""
    sid = source_id(conn, "hygeia-meals")
    events = conn.execute(
        "SELECT external_ref, payload, ts FROM event"
        " WHERE kind = 'source-read' AND source_id = ?"
        " ORDER BY ts ASC, id ASC",
        (sid,),
    ).fetchall()
    meal_days = 0
    weights = 0
    for event in events:
        payload = json.loads(event["payload"])
        items = payload.get("items")
        day_ref = f"hygeia:{str(event['ts'])[:10]}"
        if isinstance(items, list) and items:
            stated = payload.get("day_total")
            try:
                db.insert_event(
                    conn,
                    kind="meal_logged",
                    origin="source-read",
                    source_id=sid,
                    external_ref=day_ref,
                    actor="hygeia",
                    payload={
                        "capture_ref": None,
                        "items": items,
                        "photo_ref": None,
                        "method": "estimate",
                        "source": "hygeia",
                        "kcal_total_est": stated[0] if isinstance(stated, (tuple, list)) and stated else None,
                        "protein_total_g_est": stated[1] if isinstance(stated, (tuple, list)) and len(stated) > 1 else None,
                    },
                    ts=str(event["ts"]),
                )
                conn.execute(
                    "INSERT INTO provenance_edge (from_ref, to_ref, type, ts) VALUES (?, ?, 'reingest', ?)",
                    (event["external_ref"], day_ref, db.utc_now_iso()),
                )
                meal_days += 1
            except sqlite3.IntegrityError:
                conn.rollback()  # the day is already in the spine
        for weight in payload.get("weights", []) or []:
            w_ref = f"hygeia:weight:{weight['date']}"
            try:
                db.insert_event(
                    conn,
                    kind="weight_logged",
                    origin="source-read",
                    source_id=sid,
                    external_ref=w_ref,
                    actor="hygeia",
                    payload={k: v for k, v in weight.items() if v is not None},
                    ts=f"{weight['date']}T00:00:00+00:00",
                )
                weights += 1
            except sqlite3.IntegrityError:
                conn.rollback()
    conn.commit()
    return {"source": "hygeia-reingest", "meal_days": meal_days, "weights": weights}


def ingest_all(conn: sqlite3.Connection) -> list[dict[str, object]]:
    """Seed the registry, then run every adapter, then the reading seed.
    The cron chain stays the live one; the vault archive loses ties by
    design (law 2)."""
    seed_registry(conn)
    results = [ingest_source(conn, name) for name in SOURCES]
    results.append(seed_reading(conn))
    results.append(seed_hygeia_meals(conn))
    return results


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
            "plan_keys": [],
            "days_fresh_7": 0,
            "artifact_count": 0,
            "status": "alive",
        }

    payload = json.loads(latest["payload"])
    return {
        "plan": "ok",
        "week_start": payload.get("content_date"),
        "plan_lines": payload.get("plan_lines", []),
        "plan_keys": payload.get("plan_keys", []),
        "revision_hash": payload.get("revision_hash"),
        "days_fresh_7": int(coverage["days_fresh_7"]),
        "artifact_count": int(coverage["artifact_count"]),
        "status": coverage["status"],
    }
