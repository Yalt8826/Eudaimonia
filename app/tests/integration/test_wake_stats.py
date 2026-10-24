"""The wake read model (app/app/wake.py) — API and aggregation contract.

The WAKE row's honesty lives here: days not taps, recalls never counted,
the trailing-7 window rides each event's own ts (a tap queued offline for
a day still counts for the morning it happened), and an empty spine is
honest zeros — never an error, never a fabricated count.
"""

from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

import app.main as main
from app import db

DEVICE_UUID = "0f7d2a8e-4b1c-4c6e-9a2d-7f3e5a1b9c8d"


@pytest.fixture()
def db_file(tmp_path: Path) -> Path:
    path = tmp_path / "wake.db"
    conn = db.connect(path)
    db.apply_migrations(conn)
    conn.close()
    return path


@pytest.fixture()
def client(db_file: Path, monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("EUDAIMONIA_DB", str(db_file))
    return TestClient(main.app)


def tap(
    conn: Any,
    *,
    ts: str,
    method: str = "tap",
    key: str = DEVICE_UUID,
) -> None:
    """Insert one habit_tap straight into the spine (the read model reads
    whatever is there — the ingest endpoint's own tests cover the door)."""
    db.insert_event(
        conn,
        kind="habit_tap",
        origin="app-write",
        source_id=1,
        external_ref=f"{key}:{ts}",
        actor="human",
        payload={"method": method},
        ts=ts,
    )


def iso(offset_days: float, hour: int = 6, minute: int = 14, second: int = 0) -> str:
    from datetime import UTC, datetime, timedelta

    dt = datetime.now(UTC).replace(
        hour=hour, minute=minute, second=second, microsecond=0
    )
    return (dt + timedelta(days=offset_days)).isoformat()


def iso_seconds_ago(seconds: int) -> str:
    from datetime import UTC, datetime, timedelta

    return (datetime.now(UTC) - timedelta(seconds=seconds)).isoformat()


def test_empty_spine_is_honest_zeros(client: TestClient) -> None:
    r = client.get("/api/habits/wake/stats")
    assert r.status_code == 200
    assert r.json() == {"days_of_7": 0, "total_taps": 0, "last_tap": None}


def test_taps_on_three_days_count_three(
    client: TestClient, db_file: Path
) -> None:
    conn = db.connect(db_file)
    # the app source row must exist for insert_event's FK-free path (the
    # ingest route creates it; here the read model reads a hand-seeded spine)
    conn.execute(
        "INSERT INTO source (name, globs, class, success_predicate, status, ts)"
        " VALUES ('app', '[]', 'behavioral', 'row-is-artifact', 'alive', ?)",
        (db.utc_now_iso(),),
    )
    tap(conn, ts=iso(0))            # today
    tap(conn, ts=iso(-1))           # yesterday
    tap(conn, ts=iso(-6))           # the window's oldest day
    conn.commit()
    conn.close()

    r = client.get("/api/habits/wake/stats")
    body = r.json()
    assert body["days_of_7"] == 3
    assert body["total_taps"] == 3


def test_window_boundary_seven_days_ago_does_not_count(
    client: TestClient, db_file: Path
) -> None:
    conn = db.connect(db_file)
    conn.execute(
        "INSERT INTO source (name, globs, class, success_predicate, status, ts)"
        " VALUES ('app', '[]', 'behavioral', 'row-is-artifact', 'alive', ?)",
        (db.utc_now_iso(),),
    )
    tap(conn, ts=iso(-7))  # one day OUTSIDE the trailing 7
    tap(conn, ts=iso(0))
    conn.commit()
    conn.close()

    body = client.get("/api/habits/wake/stats").json()
    assert body["days_of_7"] == 1
    assert body["total_taps"] == 2


def test_multiple_taps_one_day_count_one_day(
    client: TestClient, db_file: Path
) -> None:
    """The 4-event morning: four taps, ONE day. Days, not taps."""
    conn = db.connect(db_file)
    conn.execute(
        "INSERT INTO source (name, globs, class, success_predicate, status, ts)"
        " VALUES ('app', '[]', 'behavioral', 'row-is-artifact', 'alive', ?)",
        (db.utc_now_iso(),),
    )
    for i, m in enumerate(("tap", "recall", "recall", "tap")):
        tap(conn, ts=iso(0, minute=len(m), second=i), method=m)
    conn.commit()
    conn.close()

    body = client.get("/api/habits/wake/stats").json()
    assert body["days_of_7"] == 1
    assert body["total_taps"] == 4


def test_recall_never_counts_toward_days(
    client: TestClient, db_file: Path
) -> None:
    """Law 11: estimated never renders as measured — but the last-tap
    surface still reports the recall (with its method) so the client can
    render the `~`."""
    conn = db.connect(db_file)
    conn.execute(
        "INSERT INTO source (name, globs, class, success_predicate, status, ts)"
        " VALUES ('app', '[]', 'behavioral', 'row-is-artifact', 'alive', ?)",
        (db.utc_now_iso(),),
    )
    tap(conn, ts=iso(-9), method="tap")   # outside the window, counts total only
    tap(conn, ts=iso_seconds_ago(90), method="recall")  # inside, estimates only
    conn.commit()
    conn.close()

    body = client.get("/api/habits/wake/stats").json()
    assert body["days_of_7"] == 0  # no REAL tap in the window
    assert body["total_taps"] == 2
    assert body["last_tap"] is not None
    assert body["last_tap"]["method"] == "recall"
    assert body["last_tap"]["age_minutes"] == 1  # 90s -> one whole minute
