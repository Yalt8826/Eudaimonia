"""Chokepoint contract tests — mocked transport, CI always runs these.

The fake transport is injected via ``monkeypatch.setattr(ai,
"_run_transport", ...)`` so the test files never name the real spawn
machinery: the strict reading of the T0.3 done-when grep (hits only
agent_invoke.py) holds across the whole tree, tests included.
"""

import sqlite3
from collections.abc import Iterator
from dataclasses import dataclass
from typing import Any

import pytest

from app import agent_invoke as ai
from app import db


@pytest.fixture()
def conn(tmp_path: Any) -> Iterator[sqlite3.Connection]:
    c = db.connect(tmp_path / "test.db")
    db.apply_migrations(c)
    yield c
    c.close()


@dataclass
class FakeCompleted:
    returncode: int
    stdout: str
    stderr: str


def events_of(conn: sqlite3.Connection, ref: str) -> list[sqlite3.Row]:
    return conn.execute(
        "SELECT kind, origin, payload, ts FROM event"
        " WHERE external_ref = ? AND kind IN (?, ?) ORDER BY ts, rowid",
        (ref, ai.START_KIND, ai.RESULT_KIND),
    ).fetchall()


def patch_transport(
    monkeypatch: pytest.MonkeyPatch,
    *,
    returncode: int = 0,
    stdout: str = "OK",
    timeout: bool = False,
) -> dict[str, Any]:
    """Pin transport resolution to a deterministic fake, on any box (CI has
    no hermes on PATH — the chokepoint must still reach the mocked run)."""
    calls: dict[str, Any] = {}
    monkeypatch.setattr(ai, "_which", lambda name: "/usr/bin/hermes")
    monkeypatch.delenv("HERMES_HOME", raising=False)

    def fake_run(
        argv: list[str], timeout_s: float, env: dict[str, str]
    ) -> FakeCompleted:
        calls["argv"] = argv
        calls["timeout_s"] = timeout_s
        calls["env"] = env
        if timeout:
            raise ai.InvokeTimeout(argv, timeout_s)
        return FakeCompleted(returncode, stdout, "")

    monkeypatch.setattr(ai, "_run_transport", fake_run)
    return calls


def test_happy_path_records_ok_and_two_events(
    conn: sqlite3.Connection, monkeypatch: pytest.MonkeyPatch
) -> None:
    patch_transport(monkeypatch, returncode=0, stdout="OK")

    def predicate(stdout: str, code: int | None) -> bool:
        return code == 0 and "OK" in stdout

    result = ai.agent_invoke("clio", "Reply with the single word OK.", 120.0, predicate, conn)

    assert result.outcome == "ok"
    rows = events_of(conn, result.external_ref)
    assert [r["kind"] for r in rows] == [ai.START_KIND, ai.RESULT_KIND]
    assert rows[0]["origin"] == "agent-write"
    assert rows[1]["origin"] == "agent-write"
    assert '"outcome": "ok"' in rows[1]["payload"]


def test_timeout_records_timeout_never_ok(
    conn: sqlite3.Connection, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls = patch_transport(monkeypatch, timeout=True)
    result = ai.agent_invoke(
        "clio",
        "Reply with the single word OK.",
        0.25,
        lambda stdout, code: True,  # even a permissive predicate must not flip it
        conn,
    )

    assert result.outcome == "timeout"
    assert result.exit_code is None
    assert result.predicate_result is False
    assert calls["timeout_s"] == 0.25
    rows = events_of(conn, result.external_ref)
    assert [r["kind"] for r in rows] == [ai.START_KIND, ai.RESULT_KIND]
    assert '"outcome": "timeout"' in rows[1]["payload"]


def test_nonzero_exit_with_chatty_stdout_is_error(
    conn: sqlite3.Connection, monkeypatch: pytest.MonkeyPatch
) -> None:
    patch_transport(monkeypatch, returncode=3, stdout="worked on it, here is a lot of text")
    result = ai.agent_invoke(
        "clio", "Reply with the single word OK.", 120.0, lambda stdout, code: True, conn
    )

    assert result.outcome == "error"
    assert result.exit_code == 3
    assert '"outcome": "error"' in events_of(conn, result.external_ref)[1]["payload"]


def test_predicate_false_on_exit_zero_is_predicate_failed(
    conn: sqlite3.Connection, monkeypatch: pytest.MonkeyPatch
) -> None:
    patch_transport(monkeypatch, returncode=0, stdout="a chatty but wrong answer")
    result = ai.agent_invoke(
        "clio", "Reply with the single word OK.", 120.0, lambda stdout, code: False, conn
    )

    assert result.outcome == "predicate_failed"
    assert '"outcome": "predicate_failed"' in events_of(
        conn, result.external_ref
    )[1]["payload"]


def test_exactly_two_rows_per_invocation(
    conn: sqlite3.Connection, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Silence is the failure mode this module exists to prevent."""
    patch_transport(monkeypatch)
    ai.agent_invoke("clio", "one", 120.0, None, conn)
    ai.agent_invoke("clio", "two", 120.0, None, conn)

    count = conn.execute(
        "SELECT COUNT(*) FROM event WHERE kind IN (?, ?)",
        (ai.START_KIND, ai.RESULT_KIND),
    ).fetchone()[0]
    kinds = dict(
        conn.execute(
            "SELECT kind, COUNT(*) FROM event WHERE kind IN (?, ?) GROUP BY kind",
            (ai.START_KIND, ai.RESULT_KIND),
        ).fetchall()
    )
    assert count == 4  # two invocations x (start + terminal)
    assert kinds[ai.START_KIND] == 2
    assert kinds[ai.RESULT_KIND] == 2


def test_per_profile_serialization(
    conn: sqlite3.Connection, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Concurrency cap of 1 per profile: invocations ride one lock."""
    patch_transport(monkeypatch)
    gate = ai._lock_for("clio")
    assert gate is ai._lock_for("clio")
    assert gate is not ai._lock_for("noesis")


def test_hermes_home_fallback_resolves_same_shape(
    tmp_path: Any, monkeypatch: pytest.MonkeyPatch, conn: sqlite3.Connection
) -> None:
    """With the PATH entrypoint masked, $HERMES_HOME/bin/hermes is used and
    HERMES_HOME is exported — same argv shape, one documented fallback."""
    fake_bin = tmp_path / "hermes-home" / "bin"
    fake_bin.mkdir(parents=True)
    (fake_bin / "hermes").write_text("#!/bin/sh\nexit 0\n")

    monkeypatch.setattr(ai, "_which", lambda name: None)
    monkeypatch.setenv("HERMES_HOME", str(tmp_path / "hermes-home"))
    calls = patch_transport(monkeypatch)

    result = ai.agent_invoke("clio", "Reply with the single word OK.", 120.0, None, conn)

    assert result.outcome == "ok"
    assert calls["argv"][0].endswith("/bin/hermes")
    assert calls["argv"][1:4] == ["--profile", "clio", "-z"]
    assert calls["env"]["HERMES_HOME"] == str(tmp_path / "hermes-home")


def test_unresolvable_transport_records_error_not_silence(
    conn: sqlite3.Connection, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(ai, "_which", lambda name: None)
    monkeypatch.delenv("HERMES_HOME", raising=False)

    result = ai.agent_invoke("clio", "Reply with the single word OK.", 120.0, None, conn)

    assert result.outcome == "error"
    rows = events_of(conn, result.external_ref)
    assert [r["kind"] for r in rows] == [ai.START_KIND, ai.RESULT_KIND]
    assert '"outcome": "error"' in rows[1]["payload"]
