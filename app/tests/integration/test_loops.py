"""T2.2 — the waiting-on inbox: read model + resolution landings.

- done / roll / drop each emit exactly one event; the loop ROW is the
  denormalized cache and follows its event
- double-tap the same day -> ONE event (the spine's UNIQUE gate), row
  already settled — idempotent, never an error
- roll advances the row's ts (the owed date moves; age re-sorts)
- drop carries the first-drop reason in the payload
- the offline door (generic /api/events/{kind}) applies the cache update
  on drain — one write path, online or queued
- tabs never mix: the read partitions by direction
"""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import app.main as main
from app import db


@pytest.fixture()
def db_file(tmp_path: Path) -> Path:
    path = tmp_path / "loops.db"
    conn = db.connect(path)
    db.apply_migrations(conn)
    # three open loops, two directions
    now = db.utc_now_iso()
    conn.execute(
        "INSERT INTO loop (text, direction, ts) VALUES ('reply to APS India', 'owed-by-me', ?)",
        (now,),
    )
    conn.execute(
        "INSERT INTO loop (text, direction, ts)"
        " VALUES ('the dentist owes a booking', 'owed-to-me', ?)",
        (now,),
    )
    conn.commit()
    conn.close()
    return path


@pytest.fixture()
def client(db_file: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("EUDAIMONIA_DB", str(db_file))
    return TestClient(main.app)


def test_open_loops_partitions_by_direction(client: TestClient) -> None:
    r = client.get("/api/loops/open")
    body = r.json()
    assert body["count"] == 2
    assert body["owed_by_me"] == 1
    assert body["owed_to_me"] == 1
    assert [row["text"] for row in body["loops"]] == [
        "reply to APS India",
        "the dentist owes a booking",
    ]


def test_done_emits_event_and_settles_row(client: TestClient, db_file: Path) -> None:
    r = client.post(
        "/api/events/loop_done",
        json={
            "idempotency_key": "device-uuid-1",
            "kind": "loop_done",
            "ts": 1792845000000,
            "payload": {"loop_id": 1},
        },
    )
    assert r.status_code == 200

    conn = db.connect(db_file)
    events = conn.execute(
        "SELECT kind, external_ref, payload, actor FROM event WHERE kind = 'loop_done'"
    ).fetchall()
    status = conn.execute("SELECT status FROM loop WHERE id = 1").fetchone()
    conn.close()

    assert len(events) == 1
    ref = events[0]["external_ref"]
    assert ref.startswith("1:") and len(ref.split(":")[1]) == 10  # {loop_id}:{date}
    assert events[0]["actor"] == "human"
    assert status["status"] == "done"


def test_double_tap_same_day_is_one_event_and_idempotent(
    client: TestClient, db_file: Path
) -> None:
    body = {
        "idempotency_key": "device-uuid-1",
        "kind": "loop_done",
        "ts": 1792845000000,
        "payload": {"loop_id": 1},
    }
    assert client.post("/api/events/loop_done", json=body).status_code == 200
    # the replay (the outbox's stop-and-retry can re-post the same body)
    r2 = client.post("/api/events/loop_done", json=body)
    assert r2.status_code == 200
    assert r2.json()["duplicate"] is True

    conn = db.connect(db_file)
    n = conn.execute("SELECT COUNT(*) FROM event WHERE kind = 'loop_done'").fetchone()[0]
    conn.close()
    assert n == 1


def test_roll_advances_row_ts_and_re_ranks(
    client: TestClient, db_file: Path
) -> None:
    conn = db.connect(db_file)
    before = conn.execute("SELECT ts FROM loop WHERE id = 1").fetchone()["ts"]
    conn.close()

    r = client.post(
        "/api/events/loop_rolled",
        json={
            "idempotency_key": "device-uuid-1",
            "kind": "loop_rolled",
            "ts": 1792845000000,
            "payload": {"loop_id": 1},
        },
    )
    assert r.status_code == 200

    conn = db.connect(db_file)
    after = conn.execute("SELECT ts FROM loop WHERE id = 1").fetchone()["ts"]
    status = conn.execute("SELECT status FROM loop WHERE id = 1").fetchone()["status"]
    rolled = conn.execute(
        "SELECT COUNT(*) FROM event WHERE kind = 'loop_rolled'"
    ).fetchone()[0]
    conn.close()

    assert after > before  # the owed date moved to the roll
    assert status == "rolled"
    assert rolled == 1


def test_drop_carries_reason_and_settles_row(
    client: TestClient, db_file: Path
) -> None:
    r = client.post(
        "/api/events/loop_dropped",
        json={
            "idempotency_key": "device-uuid-1",
            "kind": "loop_dropped",
            "ts": 1792845000000,
            "payload": {"loop_id": 2, "reason": "the booking happened without me"},
        },
    )
    assert r.status_code == 200

    conn = db.connect(db_file)
    dropped = conn.execute(
        "SELECT payload, status FROM event e JOIN loop l ON l.id = 2"
        " WHERE e.kind = 'loop_dropped'"
    ).fetchall()
    status = conn.execute("SELECT status FROM loop WHERE id = 2").fetchone()["status"]
    conn.close()

    assert len(dropped) == 1
    assert "the booking happened without me" in dropped[0]["payload"]
    assert status == "dropped"


def test_resolution_for_missing_row_lands_event_row_update_noops(
    client: TestClient, db_file: Path
) -> None:
    """Spine-first: a resolution event is valid truth even if the cache row
    it names never existed — the event lands, the row update no-ops (its
    rowcount is 0), the queue drains clean. Never a poison entry."""
    r = client.post(
        "/api/events/loop_done",
        json={
            "idempotency_key": "device-uuid-1",
            "kind": "loop_done",
            "ts": 1792845000000,
            "payload": {"loop_id": 999},
        },
    )
    assert r.status_code == 200
    assert r.json()["duplicate"] is False

    conn = db.connect(db_file)
    events = conn.execute("SELECT 1 FROM event WHERE kind = 'loop_done'").fetchall()
    conn.close()
    assert len(events) == 1


def test_resolution_via_read_model_direct(client: TestClient, db_file: Path) -> None:
    """resolve() through the read model module — the inbox's server-side
    shape (the offline drain calls apply_resolution_event; the online
    direct door is this function)."""
    from app import loops

    conn = db.connect(db_file)
    result = loops.resolve(conn, kind="loop_rolled", loop_id=2)
    again = loops.resolve(conn, kind="loop_rolled", loop_id=2)
    conn.close()

    assert result["duplicate"] is False
    assert result["resolution"] == "rolled"
    assert again["duplicate"] is True  # same loop, same day: one event
