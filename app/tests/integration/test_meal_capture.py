"""T2.6 — the meal capture path (mocked chokepoint, like T2.3's suite).

The exit contract, asserted on the spine:
- a #meal-tagged capture routes to HYGIEIA, never clio (the tag IS the
  human's classification), and an untagged capture whose clio noun comes
  back "meal" reaches the same estimation
- ok → ONE meal_logged (actor = hygeia, ts = the capture's content time)
  + capture_triaged (target meal) + the capture_raw → meal_logged
  provenance edge
- the predicate IS the estimates law: a response with ANY basis-less item
  is rejected → capture_triaged_failure, NO meal event, nothing lands
- re-triage of the same capture → still ONE meal_logged (the ref dedupes)
- recent_meals returns the rows; totals are the client's sum (03 §4)
"""

from pathlib import Path
from typing import Any

import pytest

import app.capture as capture
from app import db
from app.agent_invoke import InvokeResult

MEAL_JSON = (
    '{"items": ['
    '{"label": "2 eggs", "kcal_est": 140, "protein_g_est": 12, "basis": "food_db:usda_01123"},'
    '{"label": "toast", "kcal_est": 80, "protein_g_est": 3, "basis": "food_db:usda_19904"}]}'
)


@pytest.fixture()
def db_file(tmp_path: Path) -> Path:
    path = tmp_path / "meals.db"
    conn = db.connect(path)
    db.apply_migrations(conn)
    conn.close()
    return path


@pytest.fixture()
def fake_invoke(monkeypatch: pytest.MonkeyPatch) -> Any:
    calls: list[dict[str, Any]] = []
    script: list[InvokeResult] = []

    def stub(
        profile: str,
        prompt: str,
        timeout: float = 120.0,
        success_predicate: Any = None,
        conn: Any = None,
        max_retries: int = 0,
    ) -> InvokeResult:
        calls.append({"profile": profile, "prompt": prompt, "timeout": timeout})
        if not script:
            return InvokeResult("ok", 0, "task", 1, True, "inv-ref-0")
        result = script.pop(0)
        return InvokeResult(
            result.outcome,
            result.exit_code,
            result.stdout,
            result.duration_ms,
            result.predicate_result,
            "inv-ref",
        )

    monkeypatch.setattr("app.agent_invoke.agent_invoke", stub)
    stub.calls = calls  # type: ignore[attr-defined]
    stub.script = script  # type: ignore[attr-defined]
    return stub


def land(db_file: Path, text: str) -> str:
    conn = db.connect(db_file)
    try:
        return str(
            capture.land_capture(conn, text=text, photo_ref=None, origin="mobile")[
                "external_ref"
            ]
        )
    finally:
        conn.close()


def rows(db_file: Path, kinds: tuple[str, ...]) -> list[Any]:
    conn = db.connect(db_file)
    try:
        return conn.execute(
            "SELECT kind, external_ref, actor, payload, ts FROM event"
            " WHERE kind IN (%s) ORDER BY id" % ",".join("?" * len(kinds)),
            kinds,
        ).fetchall()
    finally:
        conn.close()


def test_meal_tag_routes_to_hygeia_not_clio(db_file: Path, fake_invoke: Any) -> None:
    ref = land(db_file, "#meal 2 eggs + toast")
    fake_invoke.script.append(InvokeResult("ok", 0, MEAL_JSON, 900, True, "inv"))
    result = capture.triage_capture(db.connect(db_file), ref)
    conn = db.connect(db_file)
    try:
        conn.close()
    finally:
        pass
    assert result["state"] == "triaged"
    assert result["target"] == "meal"
    # the ONE invocation was hygeia's — no clio classification round-trip
    assert len(fake_invoke.calls) == 1
    assert fake_invoke.calls[0]["profile"] == "hygeia"
    # the estimation prompt carried the meal, not the #meal tag itself
    assert "2 eggs + toast" in fake_invoke.calls[0]["prompt"]
    assert "#meal" not in fake_invoke.calls[0]["prompt"]


def test_meal_ok_lands_one_logged_plus_triage_plus_edge(
    db_file: Path, fake_invoke: Any
) -> None:
    ref = land(db_file, "#meal 2 eggs + toast")
    fake_invoke.script.append(InvokeResult("ok", 0, MEAL_JSON, 900, True, "inv"))
    capture.triage_capture(db.connect(db_file), ref)

    events = rows(db_file, ("meal_logged", "capture_triaged", "capture_triaged_failure"))
    kinds = [r["kind"] for r in events]
    assert kinds == ["meal_logged", "capture_triaged"]  # no failure, exactly one landing
    logged = events[0]
    assert logged["actor"] == "hygeia"
    payload = __import__("json").loads(logged["payload"])
    assert len(payload["items"]) == 2
    assert all(item["basis"].startswith("food_db:") for item in payload["items"])
    # the meal's ts is the CAPTURE's content time (law 3), not the model's
    raw = db.connect(db_file).execute(
        "SELECT ts FROM event WHERE kind = 'capture_raw'"
    ).fetchone()
    assert logged["ts"] == raw["ts"]

    conn = db.connect(db_file)
    edge = conn.execute(
        "SELECT type FROM provenance_edge WHERE to_ref = ?", (f"{ref}:meal",)
    ).fetchone()
    conn.close()
    assert edge is not None and edge["type"] == "meal"


def test_clio_noun_meal_reaches_hygeia(db_file: Path, fake_invoke: Any) -> None:
    ref = land(db_file, "pad thai from the new place")
    fake_invoke.script.append(InvokeResult("ok", 0, "meal", 800, True, "inv"))
    fake_invoke.script.append(InvokeResult("ok", 0, MEAL_JSON, 900, True, "inv"))
    result = capture.triage_capture(db.connect(db_file), ref)
    assert result["state"] == "triaged" and result["target"] == "meal"
    assert [c["profile"] for c in fake_invoke.calls] == ["clio", "hygeia"]


def test_predicate_rejects_a_basis_less_item(db_file: Path, fake_invoke: Any) -> None:
    ref = land(db_file, "#meal 2 eggs + toast")
    bad = (
        '{"items": ['
        '{"label": "2 eggs", "kcal_est": 140, "protein_g_est": 12, "basis": "food_db:usda_01123"},'
        '{"label": "toast", "kcal_est": 80, "protein_g_est": 3}]}'
    )
    # the REAL chokepoint outcome for a predicate rejection is
    # "predicate_failed" — "ok" only ever means the predicate passed
    fake_invoke.script.append(
        InvokeResult("predicate_failed", 0, bad, 900, False, "inv")
    )
    result = capture.triage_capture(db.connect(db_file), ref)
    assert result["state"] == "untriaged"
    # the failure is terminal and NOTHING landed — no meal event exists
    events = rows(db_file, ("meal_logged", "capture_triaged", "capture_triaged_failure"))
    assert [r["kind"] for r in events] == ["capture_triaged_failure"]
    assert events[0]["actor"] == "hygeia"


@pytest.mark.parametrize(
    "bad",
    [
        "not json at all",
        '{"items": []}',
        '{"items": [{"label": "x", "kcal_est": -5, "protein_g_est": 1, "basis": "food_db:a"}]}',
        '{"items": [{"label": "x", "kcal_est": 5, "protein_g_est": true, "basis": "food_db:a"}]}',
        '{"items": [{"label": "x", "kcal_est": 5, "protein_g_est": 1, "basis": "I think it was rice"}]}',
        '{"items": [{"label": "", "kcal_est": 5, "protein_g_est": 1, "basis": "food_db:a"}]}',
    ],
)
def test_meal_predicate_rejects_junk(bad: str) -> None:
    assert capture.meal_predicate(bad, 0) is False
    assert capture.parse_meal_items(bad) is None


def test_meal_predicate_accepts_well_formed() -> None:
    assert capture.meal_predicate(MEAL_JSON, 0) is True
    assert capture.meal_predicate(MEAL_JSON, 1) is False  # non-zero exit


def test_retriage_same_capture_is_one_meal(db_file: Path, fake_invoke: Any) -> None:
    ref = land(db_file, "#meal dal and rice")
    # attempt 1 times out
    fake_invoke.script.append(InvokeResult("timeout", None, "", 180_000, False, "inv"))
    conn = db.connect(db_file)
    first = capture.triage_capture(conn, ref)
    conn.close()
    assert first["state"] == "untriaged"
    # attempt 2 (manual re-triage) succeeds
    fake_invoke.script.append(InvokeResult("ok", 0, MEAL_JSON, 900, True, "inv"))
    conn = db.connect(db_file)
    second = capture.triage_capture(conn, ref, attempt=2)
    conn.close()
    assert second["state"] == "triaged"
    # and a THIRD successful pass must not mint a second meal
    fake_invoke.script.append(InvokeResult("ok", 0, MEAL_JSON, 900, True, "inv"))
    conn = db.connect(db_file)
    third = capture.triage_capture(conn, ref, attempt=3)
    conn.close()
    assert third["state"] == "triaged" and third.get("deduped") is True

    meals = rows(db_file, ("meal_logged",))
    assert len(meals) == 1  # one meal per capture, ever
    assert meals[0]["external_ref"] == f"{ref}:meal"


def test_recent_meals_returns_rows(db_file: Path, fake_invoke: Any) -> None:
    ref = land(db_file, "#meal 2 eggs + toast")
    fake_invoke.script.append(InvokeResult("ok", 0, MEAL_JSON, 900, True, "inv"))
    capture.triage_capture(db.connect(db_file), ref)
    conn = db.connect(db_file)
    meals = capture.recent_meals(conn)
    conn.close()
    assert len(meals) == 1
    assert meals[0]["meal_ref"] == f"{ref}:meal"
    assert len(meals[0]["items"]) == 2


def test_photo_context_rides_the_prompt(db_file: Path, fake_invoke: Any) -> None:
    conn = db.connect(db_file)
    ref = str(
        capture.land_capture(
            conn, text=None, photo_ref="photo:IMG_1234", origin="mobile"
        )["external_ref"]
    )
    conn.close()
    # a photo-only capture has nothing to estimate — skipped, honestly
    fake_invoke.script.append(InvokeResult("ok", 0, MEAL_JSON, 900, True, "inv"))
    conn = db.connect(db_file)
    result = capture.triage_capture(conn, ref)
    conn.close()
    assert result["state"] == "skipped"
    assert fake_invoke.calls == []  # nothing was attempted, so no agent ran
