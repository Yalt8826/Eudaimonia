"""T3.2 — the Hygeia behavioral adapter + the meal re-ingest.

The fixtures are the LIVE week files (copied from the vault): week1 with
42 meal rows over Aug 10–16, week2–4 as '—'-placeholder skeletons whose
week4 carries September days under an August title, and the measured
weight series. The exit invariants: meals dated Aug 10–16 ONLY, rows
canonical, estimates carry provenance and weights do not (law 11 in both
directions), re-ingest inserts nothing, and the coverage view reads the
demoted truth (0 of 7 today).
"""

from pathlib import Path
from typing import Any

import pytest

from app import adapters, db

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures" / "hygeia" / "Hygeia"


@pytest.fixture()
def conn(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Any:
    vault = tmp_path / "vault"
    vault.mkdir()
    import shutil

    shutil.copytree(FIXTURES, vault / "Hygeia")
    monkeypatch.setenv("EUDAIMONIA_VAULT", str(vault))
    c = db.connect(tmp_path / "hygeia.db")
    db.apply_migrations(c)
    yield c
    c.close()


def full_ingest(conn: Any) -> list[dict[str, Any]]:
    return adapters.ingest_all(conn)


def test_fresh_ingest_meals_aug_10_16_only(conn: Any) -> None:
    results = full_ingest(conn)
    hygeia = next(r for r in results if r.get("source") == "hygeia-reingest")
    assert hygeia["meal_days"] == 7  # Aug 10–16, one meal_logged per day
    assert hygeia["weights"] == 1  # the single measured point

    events = conn.execute(
        "SELECT ts, payload FROM event WHERE kind = 'meal_logged' ORDER BY ts"
    ).fetchall()
    dates = [e["ts"][:10] for e in events]
    assert dates == [f"2026-08-{d:02d}" for d in range(10, 17)]  # ONLY Aug 10–16
    # nothing before Aug 10 or after Aug 16 — the skeleton weeks and the
    # September-titled sections in week4 yielded nothing (headers are truth)
    assert min(dates) >= "2026-08-10" and max(dates) <= "2026-08-16"

    total_rows = sum(len(__import__("json").loads(e["payload"])["items"]) for e in events)
    assert total_rows == 42  # the live week file's row count


def test_skeleton_weeks_yield_zero_meal_rows(conn: Any) -> None:
    full_ingest(conn)
    # week2–4 day sections carry the '—' placeholder and NO table rows:
    # absence parses to zero rows, never zeros (law 7)
    for date in ("2026-08-17", "2026-09-01", "2026-09-06"):
        row = conn.execute(
            "SELECT COUNT(*) c FROM event WHERE kind = 'meal_logged' AND ts LIKE ?",
            (f"{date}%",),
        ).fetchone()["c"]
        assert row == 0


def test_rows_are_canonical_and_the_stated_total_rides_the_payload(conn: Any) -> None:
    full_ingest(conn)
    mon = conn.execute(
        "SELECT payload FROM event WHERE kind = 'meal_logged'"
        " AND ts LIKE '2026-08-10%'"
    ).fetchone()
    payload = __import__("json").loads(mon["payload"])
    row_sum = sum(i["kcal_est"] for i in payload["items"])
    assert payload["kcal_total_est"] == 1735  # the file's stated Day total
    assert row_sum == payload["kcal_total_est"]  # Hygeia's arithmetic holds
    # a mismatch would ride the same field for the render to flag — the
    # rows stay canonical either way
    assert all(i["basis"] == "food_db:hygeia" for i in payload["items"])


def test_estimates_carry_provenance_weights_do_not(conn: Any) -> None:
    full_ingest(conn)
    meal = conn.execute(
        "SELECT payload FROM event WHERE kind = 'meal_logged' LIMIT 1"
    ).fetchone()
    payload = __import__("json").loads(meal["payload"])
    assert all("basis" in i and i["basis"].startswith("food_db:") for i in payload["items"])
    assert payload["method"] == "estimate"

    weight = conn.execute(
        "SELECT payload FROM event WHERE kind = 'weight_logged'"
    ).fetchone()
    wpayload = __import__("json").loads(weight["payload"])
    assert wpayload["weight_kg"] == 80.0
    assert "basis" not in wpayload  # measured: no estimate provenance (law 11)


def test_second_full_ingest_inserts_nothing(conn: Any) -> None:
    full_ingest(conn)
    counts = conn.execute("SELECT COUNT(*) AS events FROM event").fetchone()
    full_ingest(conn)
    after = conn.execute("SELECT COUNT(*) AS events FROM event").fetchone()
    assert after["events"] == counts["events"]


def test_coverage_view_reads_the_demoted_truth(conn: Any) -> None:
    full_ingest(conn)
    row = conn.execute(
        "SELECT days_fresh_7, artifact_count, paused_evidence FROM coverage"
        " WHERE source_name = 'hygeia-meals'"
    ).fetchone()
    # today the covered days (Aug 10–16) are outside the trailing 7:
    # 0 of 7, but the artifact evidence is real, never an empty screen
    assert row["days_fresh_7"] == 0
    assert row["artifact_count"] >= 7  # week1's 7 covered-day reads (+ the csv revision)
    assert row["paused_evidence"] == 0  # hygeia was never paused


def test_meal_logged_rows_are_read_model_ready(conn: Any) -> None:
    full_ingest(conn)
    import json

    from app.capture import recent_meals

    meals = recent_meals(conn, limit=60)
    # the Hygeia days flow through the SAME read model the capture path uses
    assert len(meals) >= 7
    first = meals[0]
    assert first["items"] and first["items"][0]["basis"].startswith("food_db:")
    assert first["photo_ref"] is None
