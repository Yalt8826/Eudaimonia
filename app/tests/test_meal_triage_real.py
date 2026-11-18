"""T2.6's real round-trip — hardware-gated (run on olympus, like T2.3's).

A real #meal capture through the meal path against the real hygeia
profile. The estimator's numbers are its own — never asserted; what IS
asserted: a legal terminal inside the budget, and triaged means the
meal_logged row carries per-item food_db bases (the estimates law held
at the predicate, live).
"""

import json
import sqlite3
import time
from collections.abc import Iterator

import pytest

from app import capture
from app import db

EXIT_BUDGET_S = 300.0


@pytest.fixture()
def conn(tmp_path) -> Iterator[sqlite3.Connection]:
    c = db.connect(tmp_path / "meal-real.db")
    db.apply_migrations(c)
    yield c
    c.close()


@pytest.mark.real_hermes
def test_real_meal_estimation_round_trip(conn: sqlite3.Connection) -> None:
    ref = capture.land_capture(
        conn, text="#meal 2 eggs, one slice of buttered toast, black coffee", photo_ref=None, origin="mobile"
    )["external_ref"]

    started = time.monotonic()
    result = capture.triage_capture(conn, ref)
    elapsed = time.monotonic() - started

    assert elapsed < EXIT_BUDGET_S, f"meal estimation took {elapsed:.1f}s — outside the budget"

    if result["state"] == "triaged":
        assert result["target"] == "meal"
        row = conn.execute(
            "SELECT payload FROM event WHERE kind = 'meal_logged' AND external_ref = ?",
            (f"{ref}:meal",),
        ).fetchone()
        assert row is not None
        items = json.loads(row["payload"])["items"]
        assert 1 <= len(items) <= capture.MEAL_MAX_ITEMS
        assert all(str(i["basis"]).startswith("food_db:") for i in items)
        print(
            f"\nhygeia estimated {len(items)} items in {elapsed:.1f}s: "
            + ", ".join(f"{i['label']} ~{i['kcal_est']}kcal ({i['basis']})" for i in items)
        )
    else:
        assert result["state"] == "untriaged"
        print(f"\nhygeia meal estimation failed legally: {result['reason']}")
