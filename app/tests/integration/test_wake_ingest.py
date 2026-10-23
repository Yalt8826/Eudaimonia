"""T2.1 exit tests at the API layer — the wake-tap ingest contract.

The phone-side half (airplane tap → force-stop → reopen → exactly one
event) was proven against the stand-in in M5 and is re-proven against
THIS endpoint on the device; everything the server alone owns is
asserted here, on the database, not on responses:

- ts is the TAP time, to the millisecond (law 3 / T2.1 [impl])
- a replay N times is one row, duplicate:true after the first
- idempotency_key alone dedupes NOTHING (it is the device UUID — the
  defect PHASE-P2-WRITES.md and the M3 warning at queue.ts both predict)
- source_id is non-NULL — the UNIQUE constraint cannot dedupe NULLs
- contract violations are 4xx, never a quiet 200
"""

import json
import sqlite3
import time
from collections.abc import Callable
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

import app.main as main
from app import db

DEVICE_UUID = "0f7d2a8e-4b1c-4c6e-9a2d-7f3e5a1b9c8d"
# A tap anchored in the UTC past — the skew gate (MAX_CLOCK_SKEW_S) rejects a
# tap timestamped ahead of the server, and this fixture was 01:00:06 IST
# before it was UTC, which is exactly the fault the gate exists to catch.
TAP_MS = 1792717206379  # 2026-10-23T01:00:06.379Z
TAP_ISO = "2026-10-23T01:00:06.379000+00:00"


@pytest.fixture()
def db_file(tmp_path: Path) -> Path:
    path = tmp_path / "ingest.db"
    conn = db.connect(path)
    db.apply_migrations(conn)
    conn.close()
    return path


@pytest.fixture()
def client(db_file: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("EUDAIMONIA_DB", str(db_file))
    return TestClient(main.app)


@pytest.fixture()
def rows(db_file: Path) -> Callable[[], list[sqlite3.Row]]:
    def read() -> list[sqlite3.Row]:
        conn = db.connect(db_file)
        try:
            return conn.execute("SELECT * FROM event ORDER BY id").fetchall()
        finally:
            conn.close()

    return read


def tap_body(
    ts_ms: int = TAP_MS,
    method: str = "tap",
    key: str = DEVICE_UUID,
    kind: str = "habit_tap",
    ingested_at: int | None = None,
) -> dict[str, Any]:
    """The exact body the phone's outbox POSTs (queue.ts replay())."""
    body: dict[str, Any] = {
        "idempotency_key": key,
        "kind": kind,
        "ts": ts_ms,
        "ingested_at": ts_ms + 1 if ingested_at is None else ingested_at,
        "payload": {"method": method},
    }
    return body


def test_fresh_tap_writes_one_event(
    client: TestClient, rows: Callable[[], list[sqlite3.Row]]
) -> None:
    r = client.post("/api/events/habit_tap", json=tap_body())
    assert r.status_code == 200
    assert r.json()["duplicate"] is False
    stored = rows()
    assert len(stored) == 1
    row = stored[0]
    assert row["kind"] == "habit_tap"
    assert row["origin"] == "app-write"
    assert row["actor"] == "human"
    # source_id is NOT NULL: the dedupe constraint cannot bite on NULLs.
    assert row["source_id"] is not None
    # external_ref carries the device UUID AND the tap ts — the T2.1 [impl].
    assert row["external_ref"] == f"{DEVICE_UUID}:{TAP_MS}"


def test_tap_ts_is_tap_time_not_receipt(
    client: TestClient, rows: Callable[[], list[sqlite3.Row]]
) -> None:
    client.post("/api/events/habit_tap", json=tap_body())
    stored = rows()
    assert stored[0]["ts"] == TAP_ISO


def test_ingested_at_is_server_stamp_client_stamp_preserved(
    client: TestClient, rows: Callable[[], list[sqlite3.Row]]
) -> None:
    client.post("/api/events/habit_tap", json=tap_body())
    payload = json.loads(rows()[0]["payload"])
    assert payload["method"] == "tap"
    assert payload["ingested_at"] >= TAP_ISO  # server stamp, at receipt
    assert payload["client_ingested_at"] == TAP_MS + 1  # client's, untouched


def test_replay_five_times_is_one_row(
    client: TestClient, rows: Callable[[], list[sqlite3.Row]]
) -> None:
    ids: set[int] = set()
    for i in range(5):
        r = client.post("/api/events/habit_tap", json=tap_body())
        assert r.status_code == 200
        body = r.json()
        assert body["duplicate"] is (i > 0)
        ids.add(body["event_id"])
    assert len(ids) == 1
    assert len(rows()) == 1


def test_idempotency_key_alone_does_not_dedupe(
    client: TestClient, rows: Callable[[], list[sqlite3.Row]]
) -> None:
    """THE warned defect: the key is the device UUID — constant per install.
    Five taps over an hour are five distinct ts values and five events."""
    for offset in (0, 1, 2, 3, 4):
        r = client.post(
            "/api/events/habit_tap", json=tap_body(ts_ms=TAP_MS + offset * 60_000)
        )
        assert r.status_code == 200
        assert r.json()["duplicate"] is False
    assert len(rows()) == 5


def test_two_devices_same_ts_both_stored(
    client: TestClient, rows: Callable[[], list[sqlite3.Row]]
) -> None:
    other = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee"
    client.post("/api/events/habit_tap", json=tap_body())
    r = client.post("/api/events/habit_tap", json=tap_body(key=other))
    assert r.status_code == 200
    assert r.json()["duplicate"] is False
    assert len(rows()) == 2


def test_recall_method_round_trips(
    client: TestClient, rows: Callable[[], list[sqlite3.Row]]
) -> None:
    r = client.post("/api/events/habit_tap", json=tap_body(method="recall"))
    assert r.status_code == 200
    assert json.loads(rows()[0]["payload"])["method"] == "recall"


def test_bad_method_is_4xx(
    client: TestClient, rows: Callable[[], list[sqlite3.Row]]
) -> None:
    r = client.post("/api/events/habit_tap", json=tap_body(method="snooze"))
    assert r.status_code == 422
    assert rows() == []


def test_unknown_kind_is_4xx(
    client: TestClient, rows: Callable[[], list[sqlite3.Row]]
) -> None:
    """routine_done rides this queue at T2.7 — until that task registers it,
    an unregistered kind must fail loudly, never lie in the spine."""
    r = client.post("/api/events/routine_done", json=tap_body(kind="routine_done"))
    assert r.status_code == 422
    assert "routine_done" in r.json()["detail"]
    assert rows() == []


def test_kind_mismatch_between_url_and_body_is_4xx(client: TestClient) -> None:
    r = client.post("/api/events/habit_tap", json=tap_body(kind="routine_done"))
    assert r.status_code == 422
    assert "mismatch" in r.json()["detail"]


def test_future_ts_beyond_clock_skew_is_4xx(
    client: TestClient, rows: Callable[[], list[sqlite3.Row]]
) -> None:
    r = client.post(
        "/api/events/habit_tap", json=tap_body(ts_ms=int(time.time() * 1000) + 3_600_000)
    )
    assert r.status_code == 422
    assert rows() == []


def test_nonpositive_ts_is_4xx(client: TestClient) -> None:
    assert client.post("/api/events/habit_tap", json=tap_body(ts_ms=0)).status_code == 422
    assert (
        client.post("/api/events/habit_tap", json=tap_body(ts_ms=-TAP_MS)).status_code
        == 422
    )


def test_float_ts_is_4xx_not_coerced(client: TestClient) -> None:
    body = tap_body()
    body["ts"] = float(TAP_MS)  # a JS float that lost integer-ness
    r = client.post("/api/events/habit_tap", json=body)
    assert r.status_code == 422


def test_payload_must_be_an_object(client: TestClient) -> None:
    body = tap_body()
    body["payload"] = ["tap"]
    assert client.post("/api/events/habit_tap", json=body).status_code == 422


def test_missing_fields_are_4xx(client: TestClient) -> None:
    assert client.post("/api/events/habit_tap", json={}).status_code == 422
    body = tap_body()
    del body["idempotency_key"]
    assert client.post("/api/events/habit_tap", json=body).status_code == 422


def test_short_idempotency_key_is_4xx(client: TestClient) -> None:
    assert (
        client.post("/api/events/habit_tap", json=tap_body(key="abc")).status_code == 422
    )


def test_app_source_row_created_once_and_reused(
    client: TestClient, db_file: Path
) -> None:
    first = client.post("/api/events/habit_tap", json=tap_body())
    second = client.post(
        "/api/events/habit_tap", json=tap_body(key="aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee")
    )
    assert first.status_code == second.status_code == 200
    conn = db.connect(db_file)
    try:
        sources = conn.execute("SELECT * FROM source").fetchall()
        assert len(sources) == 1
        assert sources[0]["name"] == "app"
        assert sources[0]["class"] == "behavioral"
        events = conn.execute("SELECT DISTINCT source_id FROM event").fetchall()
        assert len(events) == 1
    finally:
        conn.close()


def test_unknown_api_post_is_json_404(client: TestClient) -> None:
    r = client.post("/api/nope", json={})
    assert r.status_code == 404
    assert r.json()["detail"] == "Not found"


def test_health_still_ok(client: TestClient) -> None:
    assert client.get("/api/health").json() == {"status": "ok"}
