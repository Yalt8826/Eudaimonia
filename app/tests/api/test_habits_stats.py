"""T3.3 — the rolling-window habit stats (09 §2#4 + gates 2 and 4).

The denominator is ALWAYS the trailing window. The tests below are the
anti-run-of-days contract: a number that survives a missed day or grows
with history is a defect. The lexical gate (09 gate 4) bans the
vocabulary itself from the app source.
"""

from pathlib import Path
from typing import Any

import pytest

from app import db, habits


@pytest.fixture()
def conn(tmp_path: Path) -> Any:
    c = db.connect(tmp_path / "habits.db")
    db.apply_migrations(c)
    yield c
    c.close()


def tap(conn: Any, ts: str, method: str = "tap") -> None:
    db.insert_event(
        conn,
        kind="habit_tap",
        origin="app-write",
        source_id=None,
        external_ref=f"dev:{ts}:{method}",
        actor="human",
        payload={"method": method},
        ts=ts,
    )
    conn.commit()


def test_window_boundary_29_counts_31_does_not(conn: Any) -> None:
    # target 05:00 (minute 300), tolerance 30: 05:29 counts, 05:31 does not
    tap(conn, "2026-11-17T05:00:00+00:00")  # inside (target itself)
    assert habits.within_window(329, 300, 30) is True
    assert habits.within_window(331, 300, 30) is False
    assert habits.within_window(330, 300, 30) is True
    assert habits.within_window(270, 300, 30) is True  # 30 early: on the edge
    assert habits.within_window(269, 300, 30) is False


def test_trailing_window_slides_denominator_never_shrinks(conn: Any) -> None:
    # two taps in the trailing 7 of "now"-ish 2026-11-18 (UTC days)
    tap(conn, "2026-11-13T05:00:00+00:00")
    tap(conn, "2026-11-18T05:00:00+00:00")
    stats = habits.habit_stats(conn, tz_offset_min=330)
    assert stats["met"] == 2 and stats["of"] == 7
    # a tap 8 days back is OUTSIDE the trailing 7 — it never joins
    tap(conn, "2026-11-09T05:00:00+00:00")
    stats = habits.habit_stats(conn, tz_offset_min=330)
    assert stats["met"] == 2  # unchanged: the window slid past it


def test_recall_counts_but_marks_the_window(conn: Any) -> None:
    # 4 in-window tap days + 1 recall tap on a fifth day
    for day in ("2026-11-13", "2026-11-14", "2026-11-15", "2026-11-16"):
        tap(conn, f"{day}T05:00:00+00:00")
    tap(conn, "2026-11-17T05:00:00+00:00", method="recall")
    stats = habits.habit_stats(conn, tz_offset_min=330)
    assert stats["met"] == 5  # recalls count toward met...
    assert stats["recall_taps"] == 1
    assert stats["recall_share"] == round(1 / 5, 4)
    assert stats["recall_majority"] is False  # ...but the window stays bare


def test_recall_majority_marks_the_window(conn: Any) -> None:
    tap(conn, "2026-11-14T05:00:00+00:00")
    tap(conn, "2026-11-15T05:00:00+00:00", method="recall")
    tap(conn, "2026-11-16T05:00:00+00:00", method="recall")
    stats = habits.habit_stats(conn, tz_offset_min=330)
    assert stats["met"] == 3
    assert stats["recall_majority"] is True  # recalls ≥ half → ~ at render


def test_multiple_taps_one_day_are_one_day(conn: Any) -> None:
    tap(conn, "2026-11-18T05:00:00+00:00")
    tap(conn, "2026-11-18T05:10:00+00:00")
    tap(conn, "2026-11-18T05:20:00+00:00")
    stats = habits.habit_stats(conn, tz_offset_min=330)
    assert stats["met"] == 1  # days, not taps


def test_empty_window_is_honest(conn: Any) -> None:
    stats = habits.habit_stats(conn, tz_offset_min=330)
    assert stats["met"] == 0 and stats["of"] == 7
    assert stats["recall_share"] == 0.0 and stats["recall_majority"] is False


def test_unknown_habit_is_rejected(conn: Any) -> None:
    with pytest.raises(ValueError):
        habits.habit_stats(conn, habit="meditate")


def test_lexical_gate_no_banned_vocabulary_in_the_app_source() -> None:
    # 09 gate 4: the vocabulary itself is banned — if the concept exists
    # in the source, a render will eventually carry it
    root = Path(__file__).resolve().parents[2]
    banned = ("streak", "consecutive", "scoreboard", "cheat day")
    offenders: list[str] = []
    for py in (root / "app" / "app").rglob("*.py"):
        text = py.read_text(encoding="utf-8").lower()
        for word in banned:
            if word in text:
                offenders.append(f"{py.name}: {word}")
    assert offenders == []
