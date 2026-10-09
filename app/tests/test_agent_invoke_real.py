"""The real round-trip spike (P0 exit test) — hardware-gated.

Runs only with ``--real-hermes`` against the real binary and the real
``clio`` profile. Meant to run on olympus — the production box, where the
clio profile, the 9Router proxy, and its credential live; dev boxes have
no runtime role. Everything here is the mocked suite's mirror image,
against reality: predicate true, start + terminal events in the DB with
ts ordering and duration_ms recorded.
"""

import json
import sqlite3
from collections.abc import Iterator
from typing import Any

import pytest

from app import agent_invoke as ai
from app import db


@pytest.fixture()
def conn(tmp_path: Any) -> Iterator[sqlite3.Connection]:
    c = db.connect(tmp_path / "spike.db")
    db.apply_migrations(c)
    yield c
    c.close()


@pytest.mark.real_hermes
def test_clio_round_trip(conn: sqlite3.Connection) -> None:
    def predicate(stdout: str, exit_code: int | None) -> bool:
        return exit_code == 0 and "OK" in stdout

    result = ai.agent_invoke(
        "clio",
        "Reply with the single word OK.",
        120.0,
        predicate,
        conn,
    )

    assert result.outcome == "ok", result.stdout
    assert result.exit_code == 0
    assert result.duration_ms > 0

    rows = conn.execute(
        "SELECT kind, ts, payload FROM event"
        " WHERE external_ref = ? ORDER BY ts, rowid",
        (result.external_ref,),
    ).fetchall()
    assert [r["kind"] for r in rows] == [ai.START_KIND, ai.RESULT_KIND]
    assert rows[0]["ts"] <= rows[1]["ts"]

    payload = json.loads(rows[1]["payload"])
    assert payload["outcome"] == "ok"
    assert payload["duration_ms"] == result.duration_ms
    assert payload["predicate_result"] is True
    assert payload["exit_code"] == 0
