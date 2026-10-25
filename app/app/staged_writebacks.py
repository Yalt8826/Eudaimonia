"""The staged write-back applier (T2.4) — the ONLY vault writer in the repo.

Flow (02 §2 law 6, PHASE-P2 T2.4):

    note_added events -> pending entries in staged_writebacks/
    -> apply: append ONE line per note ("- [hh:mm] text", event-ts order)
       to THAT day's daily note -> read-back verify -> ledger marks applied
    -> a `write-back` provenance edge per note (note ref -> vault path#L)

- **Append-only, always.** The applier opens the target for append; it
  never read-modify-writes. Existing lines are never touched (03 §13).
  A missing daily note is created empty — creation of a nonexistent file
  is append-only by definition (the vault's own daily notes carry no
  frontmatter convention — measured on olympus's DailyNotes/).
- **Apply-once idempotency, two layers.** The ledger marks a note applied
  only after a VERIFIED append (read-back check, not write() returning);
  AND the content check skips an append whose exact line already exists —
  so a SIGKILL between append and ledger-mark cannot duplicate on re-run.
  The ledger is the fast path; the file content is the truth.
- **The local day.** Daily notes belong to the owner's calendar day, not
  UTC: the note's ts shifts by EUDAIMONIA_TZ_OFFSET_MINUTES (default 330
  = IST) before picking the file and the [hh:mm] stamp. A 20:00 UTC tap
  is 01:30 IST — it belongs in TOMORROW's note.
- **Failure keeps notes visible in staging** — never lost, never
  half-applied. The apply re-runs; a re-run is a no-op for settled notes.

This module is the only file allowed write-mode access to vault markdown
(the grep gate "vaultwrite" watches for writers outside it).
"""

from __future__ import annotations

import json
import os
import sqlite3
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from app import db

__all__ = [
    "apply_pending",
    "daily_note_path",
    "note_line",
    "recent_notes",
    "stage",
    "vault_root",
]


def vault_root() -> Path:
    return Path(os.environ.get("EUDAIMONIA_VAULT", "/srv/data/vaults/main"))


def staging_dir() -> Path:
    base = os.environ.get(
        "EUDAIMONIA_STAGING",
        str(Path(__file__).resolve().parents[1] / "staged_writebacks"),
    )
    path = Path(base)
    path.mkdir(parents=True, exist_ok=True)
    return path


def tz_offset() -> timedelta:
    return timedelta(minutes=int(os.environ.get("EUDAIMONIA_TZ_OFFSET_MINUTES", "330")))


def _local(ts_iso: str) -> datetime:
    return datetime.fromisoformat(ts_iso) + tz_offset()


def daily_note_path(note_ts: str) -> Path:
    """That note's daily note, in the vault's own convention:
    DailyNotes/%B-%d-%Y.md (measured: September-22-2026.md, no leading zero)."""
    local = _local(note_ts)
    return (
        vault_root()
        / "DailyNotes"
        / (local.strftime("%B") + f"-{local.day}-{local.year}.md")
    )


def note_line(note_ts: str, text: str) -> str:
    local = _local(note_ts)
    return f"- [{local.strftime('%H:%M')}] {text}"


def stage(*, external_ref: str, text: str, note_ts: str) -> Path:
    """Write one pending entry. Immediate, durable, tiny."""
    safe = external_ref.replace("/", "_").replace(":", "_")
    path = staging_dir() / f"pending-{safe}.json"
    path.write_text(
        json.dumps({"external_ref": external_ref, "text": text, "note_ts": note_ts}),
        encoding="utf-8",
    )
    return path


def _ledger() -> Path:
    return staging_dir() / "applied.jsonl"


def _applied_refs() -> set[str]:
    ledger = _ledger()
    if not ledger.exists():
        return set()
    out: set[str] = set()
    for line in ledger.read_text(encoding="utf-8").splitlines():
        if line.strip():
            out.add(json.loads(line)["external_ref"])
    return out


def apply_pending(
    conn: sqlite3.Connection | None = None,
) -> dict[str, object]:
    """Apply every pending staged note. Idempotent: settled refs fast-skip
    via the ledger; a line already present in the file (a crash between
    append and ledger) is verified and recorded, never appended twice."""
    owns_conn = conn is None
    if conn is None:
        conn = db.connect(db.db_path())
    applied_before = _applied_refs()
    ledger = _ledger()
    pending_files = sorted(
        p for p in staging_dir().glob("pending-*.json") if p.is_file()
    )
    applied = 0
    skipped = 0
    results: list[dict[str, Any]] = []

    for pending in pending_files:
        entry = json.loads(pending.read_text(encoding="utf-8"))
        ref = entry["external_ref"]
        if ref in applied_before:
            pending.unlink()
            skipped += 1
            continue

        target = daily_note_path(entry["note_ts"])
        target.parent.mkdir(parents=True, exist_ok=True)
        line = note_line(entry["note_ts"], entry["text"])

        line_no: int | None = None
        if target.exists():
            existing = target.read_text(encoding="utf-8").splitlines()
            # content is the truth: a prior run may have appended and died
            # before the ledger caught up
            if line in existing:
                line_no = existing.index(line) + 1
        if line_no is None:
            with target.open("a", encoding="utf-8") as f:
                f.write(line + "\n")
            readback = target.read_text(encoding="utf-8").splitlines()
            if line not in readback:
                # the append did not verify — leave it staged, never lie
                results.append(
                    {"ref": ref, "state": "apply-failed", "file": str(target)}
                )
                continue
            line_no = readback.index(line) + 1

        rel = target.relative_to(vault_root())
        edge_to = f"{rel}#L{line_no}"
        with ledger.open("a", encoding="utf-8") as lf:
            lf.write(
                json.dumps(
                    {"external_ref": ref, "file": edge_to, "applied_at": db.utc_now_iso()}
                )
                + "\n"
            )
        conn.execute(
            "INSERT INTO provenance_edge (from_ref, to_ref, type, ts) VALUES (?, ?, ?, ?)",
            (ref, edge_to, "write-back", db.utc_now_iso()),
        )
        conn.commit()
        pending.unlink()
        applied += 1
        results.append({"ref": ref, "state": "applied", "file": edge_to})

    if owns_conn:
        conn.close()
    return {"applied": applied, "skipped": skipped, "results": results}


def recent_notes(conn: sqlite3.Connection, limit: int = 20) -> list[dict[str, object]]:
    """Recent notes with their honest write-back state: applied (with the
    vault line ref) or staged (waiting for the applier)."""
    rows = conn.execute(
        "SELECT id, ts, external_ref, payload FROM event"
        " WHERE kind = 'note_added' ORDER BY id DESC LIMIT ?",
        (limit,),
    ).fetchall()
    out: list[dict[str, object]] = []
    for r in rows:
        text = json.loads(r["payload"]).get("text", "")
        edge = conn.execute(
            "SELECT to_ref FROM provenance_edge"
            " WHERE from_ref = ? AND type = 'write-back'"
            " ORDER BY id DESC LIMIT 1",
            (r["external_ref"],),
        ).fetchone()
        out.append(
            {
                "note_id": r["id"],
                "external_ref": r["external_ref"],
                "ts": r["ts"],
                "text": text,
                "state": "applied" if edge is not None else "staged",
                "vault_ref": edge["to_ref"] if edge is not None else None,
            }
        )
    return out
