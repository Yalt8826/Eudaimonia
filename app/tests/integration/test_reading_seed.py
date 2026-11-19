"""T3.1 — the zetesis digest adapter + the reading seed (fixture-backed).

The fixtures replicate the live chain's real shapes: two header
generations, the Aug-10 double-run (same content date, later run stamp
wins), a cross-day repeat in the wrapped-title form, a version-suffixed
link, and a FAILED edition. The invariants under test are the binding
ones: zero duplicate arXiv IDs, one provenance edge per seeded row,
re-ingest inserts nothing, events before row changes.
"""

from pathlib import Path
from typing import Any

import pytest

from app import adapters, db
from app import reading

FIXTURES = Path(__file__).resolve().parent.parent / "fixtures" / "zetesis"


@pytest.fixture()
def conn(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Any:
    monkeypatch.setenv("EUDAIMONIA_ZETESIS_CRON", str(FIXTURES))
    c = db.connect(tmp_path / "reading.db")
    db.apply_migrations(c)
    yield c
    c.close()


def test_parse_digest_two_header_generations_and_extraction() -> None:
    a1 = adapters._read("cron", [FIXTURES / "30e5f10002f2_20260810_120041.txt"])[0]
    date1, ok1, payload1 = adapters.parse_digest(a1)
    assert date1 == "2026-08-10" and ok1 is True
    ids = [p["arxiv_id"] for p in payload1["papers"]]
    assert ids == ["2608.00001", "2608.00002"]  # the tool link + news prose excluded

    a2 = adapters._read("cron", [FIXTURES / "b5b0ec782dfe_20260811_080356.txt"])[0]
    date2, ok2, payload2 = adapters.parse_digest(a2)
    assert date2 == "2026-08-11" and ok2 is True
    # the wrapped-title form and the version suffix normalize away
    assert payload2["papers"] == [
        {"arxiv_id": "2608.00002", "title": "Paper Two revisited: the wrapped form"},
        {"arxiv_id": "2608.00004", "title": "Paper Four: new today"},
    ]


def test_failed_edition_is_a_failure_not_a_seed() -> None:
    a = adapters._read("cron", [FIXTURES / "b5b0ec782dfe_20260813_080552.txt"])[0]
    date, ok, payload = adapters.parse_digest(a)
    assert ok is False
    assert payload["reason"] == "failed edition"


def test_seed_zero_dupes_one_edge_per_row(conn: Any) -> None:
    adapters.seed_registry(conn)
    adapters.ingest_source(conn, "zetesis-digest")
    result = adapters.seed_reading(conn)

    # 21 live files → 20 editions in prod; the fixtures hold 4 files over
    # 3 edition days (Aug 10 has TWO runs — one edition) + one FAILED, so
    # 3 source-read events and 4 unique papers
    editions = conn.execute(
        "SELECT COUNT(*) c FROM event WHERE kind = 'source-read'"
        " AND source_id = (SELECT id FROM source WHERE name = 'zetesis-digest')"
    ).fetchone()["c"]
    assert editions == 2  # Aug 10's two runs collapse to ONE edition; FAILED writes none
    assert result["seeded"] == 4

    seeded = conn.execute(
        "SELECT external_ref, payload, ts FROM event WHERE kind = 'reading_seeded' ORDER BY id"
    ).fetchall()
    refs = [r["external_ref"] for r in seeded]
    assert len(refs) == len(set(refs))  # zero duplicate arXiv IDs by construction
    assert refs == [
        "zetesis:2608.00001",
        "zetesis:2608.00002",
        "zetesis:2608.00003",
        "zetesis:2608.00004",
    ]

    # one provenance edge per seeded row, from the edition that introduced it
    edges = conn.execute(
        "SELECT from_ref, to_ref, type FROM provenance_edge WHERE type = 'seed'"
    ).fetchall()
    assert len(edges) == 4
    by_to = {e["to_ref"]: e["from_ref"] for e in edges}
    # Paper Two repeats in the Aug 11 edition but is linked to its INTRODUCING edition
    assert "30e5f10002f2_20260810_120720" in by_to["zetesis:2608.00002"]
    assert "b5b0ec782dfe_20260811" in by_to["zetesis:2608.00004"]
    # the Aug 10 winner is the LATER run stamp (same content date)
    assert "30e5f10002f2_20260810_120720" in by_to["zetesis:2608.00003"]

    # rows exist as the cache, status new, rating NULL, staged_ts NULL
    row = conn.execute(
        "SELECT title, status, rating, staged_ts FROM reading_item WHERE id = 1"
    ).fetchone()
    assert row["status"] == "new" and row["rating"] is None and row["staged_ts"] is None


def test_reingest_inserts_nothing(conn: Any) -> None:
    adapters.seed_registry(conn)
    adapters.ingest_source(conn, "zetesis-digest")
    adapters.seed_reading(conn)
    before = conn.execute(
        "SELECT (SELECT COUNT(*) FROM event WHERE kind IN ('reading_seeded','source-read')) e,"
        " (SELECT COUNT(*) FROM reading_item) r,"
        " (SELECT COUNT(*) FROM provenance_edge WHERE type = 'seed') p"
    ).fetchone()

    adapters.ingest_source(conn, "zetesis-digest")
    adapters.seed_reading(conn)

    after = conn.execute(
        "SELECT (SELECT COUNT(*) FROM event WHERE kind IN ('reading_seeded','source-read')) e,"
        " (SELECT COUNT(*) FROM reading_item) r,"
        " (SELECT COUNT(*) FROM provenance_edge WHERE type = 'seed') p"
    ).fetchone()
    assert dict(before) == dict(after)


def test_status_and_rating_events_then_row_changes(conn: Any) -> None:
    adapters.seed_registry(conn)
    adapters.ingest_source(conn, "zetesis-digest")
    adapters.seed_reading(conn)

    # the client door's writes: validate → apply (the ingest route does
    # validate, land, then fold — the test drives the fold directly)
    arxiv_id, status = reading.validate_status({"arxiv_id": "2608.00001", "status": "skimmed"})
    reading.apply_status(conn, arxiv_id, status)
    arxiv_id, rating = reading.validate_rating({"arxiv_id": "2608.00001", "rating": 4})
    reading.apply_rating(conn, arxiv_id, rating)

    row = conn.execute(
        "SELECT status, rating, staged_ts FROM reading_item"
        " WHERE id = (SELECT CAST(json_extract(payload,'$.row_id') AS INTEGER)"
        " FROM event WHERE external_ref = 'zetesis:2608.00001')"
    ).fetchone()
    assert row["status"] == "skimmed"
    assert row["rating"] == 4
    assert row["staged_ts"] is not None

    q = reading.queue(conn)
    assert q["banner"] == {"paused": False}  # no job_paused evidence yet
    item = next(i for i in q["items"] if i["arxiv_id"] == "2608.00001")
    assert item["status"] == "skimmed" and item["rating"] == 4
    assert item["edition_date"] == "2026-08-10"


def test_validation_rejects_junk() -> None:
    with pytest.raises(reading.ReadingError):
        reading.validate_status({"arxiv_id": "2608.00001", "status": "finished"})
    with pytest.raises(reading.ReadingError):
        reading.validate_status({"arxiv_id": "has space", "status": "new"})
    with pytest.raises(reading.ReadingError):
        reading.validate_rating({"arxiv_id": "2608.00001", "rating": 6})
    with pytest.raises(reading.ReadingError):
        reading.validate_rating({"arxiv_id": "2608.00001", "rating": True})
