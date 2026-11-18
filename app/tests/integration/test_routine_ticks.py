"""T2.7 exit tests at the API layer — the routine-tick contract.

The phone-side half (an offline tick surviving force-stop through T2.1's
queue) is asserted in the mobile jest suite and re-proven on the device;
everything the server alone owns is asserted here, on the database:

- a tap is ONE `routine_done` with external_ref "{routine_key}:{date}"
  (07 §19 — no routine table, the spine's UNIQUE is the storage)
- a double-tap on the same day (different ts) is still ONE row —
  duplicate:true, the key:date ref dedupes where key:ts could not
- the same block on ANOTHER day is a different event, not a correction
- `routine_done` carries method 'tap'|'recall' (07 §18 tick integrity);
  `routine_skip` carries none — a skip is a decision, not an estimate
- the key must be T1.3's slug shape (never typed, never free text); a
  colon in it would collide two distinct (key, date) pairs
- contract violations are 4xx, never a quiet 200
- the /api/routine/day read model returns the day's ticks as stored
"""

import json
import sqlite3
from collections.abc import Callable
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import app.main as main
from app import db

DEVICE_UUID = "0f7d2a8e-4b1c-4c6e-9a2d-7f3e5a1b9c8d"
TAP_MS = 1792717206379  # 2026-10-23T01:00:06.379Z — a real past moment
TAP_MS_LATER = TAP_MS + 45 * 1000  # the double-tap, same plan day
TAP_MS_NEXT_DAY = TAP_MS + 26 * 60 * 60 * 1000


@pytest.fixture()
def db_file(tmp_path: Path) -> Path:
    path = tmp_path / "routine.db"
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


def post(client: TestClient, kind: str, payload: dict[str, object], ts: int = TAP_MS) -> dict[str, object]:
    response = client.post(
        "/api/events/" + kind,
        json={
            "idempotency_key": DEVICE_UUID,
            "kind": kind,
            "ts": ts,
            "ingested_at": ts + 1000,
            "payload": payload,
        },
    )
    assert response.status_code == 200, response.text
    return dict(response.json())


def test_tap_is_one_done_event_with_key_date_ref(client: TestClient, rows: Callable[[], list[sqlite3.Row]]) -> None:
    body = post(client, "routine_done", {"routine_key": "gre-deep-work", "date": "2026-10-23", "method": "tap"})
    assert body["status"] == "ok" and body["duplicate"] is False
    stored = rows()
    assert len(stored) == 1
    assert stored[0]["kind"] == "routine_done"
    assert stored[0]["external_ref"] == "gre-deep-work:2026-10-23"
    assert stored[0]["source_id"] is not None
    assert stored[0]["ts"] == "2026-10-23T01:00:06.379000+00:00"


def test_double_tap_same_day_is_one_row(client: TestClient, rows: Callable[[], list[sqlite3.Row]]) -> None:
    first = post(client, "routine_done", {"routine_key": "dmat", "date": "2026-10-23", "method": "tap"})
    second = post(client, "routine_done", {"routine_key": "dmat", "date": "2026-10-23", "method": "tap"}, ts=TAP_MS_LATER)
    assert second["duplicate"] is True and second["event_id"] == first["event_id"]
    assert len(rows()) == 1


def test_same_block_next_day_is_a_new_event(client: TestClient, rows: Callable[[], list[sqlite3.Row]]) -> None:
    post(client, "routine_done", {"routine_key": "dmat", "date": "2026-10-23", "method": "tap"})
    next_day = post(client, "routine_done", {"routine_key": "dmat", "date": "2026-10-24", "method": "tap"}, ts=TAP_MS_NEXT_DAY)
    assert next_day["duplicate"] is False
    assert len(rows()) == 2


def test_recall_and_skip_are_stored_as_sent(client: TestClient, rows: Callable[[], list[sqlite3.Row]]) -> None:
    post(client, "routine_done", {"routine_key": "gre-deep-work", "date": "2026-10-23", "method": "recall"}, ts=TAP_MS_LATER)
    post(client, "routine_skip", {"routine_key": "gym", "date": "2026-10-23"}, ts=TAP_MS_LATER)
    kinds = sorted(r["kind"] for r in rows())
    assert kinds == ["routine_done", "routine_skip"]
    done = next(r for r in rows() if r["kind"] == "routine_done")
    assert json.loads(done["payload"])["method"] == "recall"


def test_done_without_method_is_a_422(client: TestClient) -> None:
    response = client.post(
        "/api/events/routine_done",
        json={
            "idempotency_key": DEVICE_UUID,
            "kind": "routine_done",
            "ts": TAP_MS,
            "payload": {"routine_key": "dmat", "date": "2026-10-23"},
        },
    )
    assert response.status_code == 422


def test_skip_with_a_method_is_a_422(client: TestClient) -> None:
    response = client.post(
        "/api/events/routine_skip",
        json={
            "idempotency_key": DEVICE_UUID,
            "kind": "routine_skip",
            "ts": TAP_MS,
            "payload": {"routine_key": "dmat", "date": "2026-10-23", "method": "recall"},
        },
    )
    assert response.status_code == 422


def test_bad_method_is_a_422(client: TestClient) -> None:
    response = client.post(
        "/api/events/routine_done",
        json={
            "idempotency_key": DEVICE_UUID,
            "kind": "routine_done",
            "ts": TAP_MS,
            "payload": {"routine_key": "dmat", "date": "2026-10-23", "method": "counted"},
        },
    )
    assert response.status_code == 422


@pytest.mark.parametrize(
    "key",
    ["", "GRE Deep Work", "gre:deep", "-gre", "gre-", "gre__work", "x" * 81],
)
def test_key_must_be_a_slug(client: TestClient, key: str) -> None:
    response = client.post(
        "/api/events/routine_done",
        json={
            "idempotency_key": DEVICE_UUID,
            "kind": "routine_done",
            "ts": TAP_MS,
            "payload": {"routine_key": key, "date": "2026-10-23", "method": "tap"},
        },
    )
    assert response.status_code == 422


@pytest.mark.parametrize("raw_date", ["2026-10-23T00:00", "23-10-2026", "2026-13-40", "not-a-date"])
def test_bad_date_is_a_422(client: TestClient, raw_date: str) -> None:
    response = client.post(
        "/api/events/routine_done",
        json={
            "idempotency_key": DEVICE_UUID,
            "kind": "routine_done",
            "ts": TAP_MS,
            "payload": {"routine_key": "dmat", "date": raw_date, "method": "tap"},
        },
    )
    assert response.status_code == 422


def test_day_read_model_returns_the_ticks(client: TestClient) -> None:
    post(client, "routine_done", {"routine_key": "dmat", "date": "2026-10-23", "method": "tap"})
    post(client, "routine_skip", {"routine_key": "gym", "date": "2026-10-23"})
    post(client, "routine_done", {"routine_key": "dmat", "date": "2026-10-24", "method": "tap"}, ts=TAP_MS_NEXT_DAY)
    response = client.get("/api/routine/day", params={"date": "2026-10-23"})
    assert response.status_code == 200
    body = response.json()
    assert body["date"] == "2026-10-23"
    ticks = sorted(body["ticks"], key=lambda t: t["routine_key"])
    assert [t["routine_key"] for t in ticks] == ["dmat", "gym"]
    assert ticks[0]["kind"] == "routine_done" and ticks[0]["method"] == "tap"
    assert ticks[1]["kind"] == "routine_skip" and ticks[1]["method"] is None
    # another day's tick must not bleed into this one
    other = client.get("/api/routine/day", params={"date": "2026-10-24"}).json()
    assert [t["routine_key"] for t in other["ticks"]] == ["dmat"]


def test_day_read_model_rejects_a_bad_date(client: TestClient) -> None:
    assert client.get("/api/routine/day", params={"date": "tomorrow"}).status_code == 422


def test_empty_day_is_an_empty_tick_list(client: TestClient) -> None:
    body = client.get("/api/routine/day", params={"date": "2026-10-23"}).json()
    assert body == {"date": "2026-10-23", "ticks": []}
