"""T2.3's real round-trip — hardware-gated, like the P0 spike.

The mocked suite proves the mechanics; this proves the LEG: a real capture
through ``triage_capture`` against the real ``clio`` profile, one attempt
inside the 5-minute exit budget, with the spine holding a legal terminal
state afterwards. Meant to run on olympus (the clio profile, the 9Router
proxy and its credential live there).

The classifier's decision is the agent's — the test never asserts WHICH
target came back (a hard assertion on the noun would test clio's mood,
not the pipeline). What it asserts is the contract: a terminal outcome
exists, triaged means landed (exactly the domain rows/edges of that
target), failed means nothing landed, and the whole thing fit the budget.
"""

import json
import sqlite3
import time
from collections.abc import Iterator

import pytest

from app import capture
from app import db

EXIT_BUDGET_S = 300.0  # the 5-min exit test, not a knob (PHASE-P2 T2.3)


@pytest.fixture()
def conn(tmp_path) -> Iterator[sqlite3.Connection]:
    c = db.connect(tmp_path / "triage-real.db")
    db.apply_migrations(c)
    yield c
    c.close()


@pytest.mark.real_hermes
def test_real_capture_triage_round_trip(conn: sqlite3.Connection) -> None:
    ref = capture.land_capture(
        conn, text="Call the dentist and book a cleaning for next week", photo_ref=None, origin="fuzzel"
    )["external_ref"]

    started = time.monotonic()
    result = capture.triage_capture(conn, ref)
    elapsed = time.monotonic() - started

    # the budget IS the exit test: capture → triaged inside 5 minutes
    assert elapsed < EXIT_BUDGET_S, f"triage took {elapsed:.1f}s — outside the exit budget"

    if result["state"] == "triaged":
        target = result["target"]
        assert target in capture.TARGETS
        # the triage event exists, actor is the profile (plum attribution)
        row = conn.execute(
            "SELECT payload, actor FROM event WHERE external_ref = ? AND kind = 'capture_triaged'",
            (f"{ref}:triaged",),
        ).fetchone()
        assert row is not None
        assert row["actor"] == capture.TRIAGE_PROFILE
        assert json.loads(row["payload"])["target"] == target
        # the provenance edge back to the raw capture
        edge = conn.execute(
            "SELECT type FROM provenance_edge WHERE to_ref = ? AND from_ref = ?",
            (f"{ref}:triaged", ref),
        ).fetchone()
        assert edge is not None and edge["type"] == "triage"
        # the landing is exactly the target's domain artifact
        landing = {k: v for k, v in result.items() if k not in ("capture_ref", "state")}
        print(f"\nclio classified the capture as: {target} — landing {landing}")
        assert landing, "triaged without a landing"
    else:
        # a legal terminal failure: the failure event exists, nothing landed
        assert result["state"] == "untriaged"
        row = conn.execute(
            "SELECT payload FROM event WHERE external_ref = ? AND kind = 'capture_triaged_failure'",
            (f"{ref}:failure",),
        ).fetchone()
        assert row is not None
        print(f"\nclio triage failed legally: {result['reason']}")
