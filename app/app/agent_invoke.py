"""The one agent primitive (02 §2 law 12) — the only module in the repo
permitted to spawn hermes. Grep-enforced: ``subprocess``/``Popen``/hermes
invocations may not appear in any other production module (EXECUTION.md §4;
scripts/lint_greps.sh chokepoint).

Primary transport: ``hermes --profile <name> -z <prompt>``.

HERMES_HOME fallback (law 12): when the ``hermes`` entrypoint is not
resolvable from the server's environment (cron shells, systemd units on
olympus have different PATHs than the interactive one), the same CLI is
resolved from ``$HERMES_HOME/bin/hermes`` and run with ``HERMES_HOME``
exported. One documented fallback, still inside this module — there is no
second spawn site anywhere in the repo.

Working real invocations (recorded; hermes v0.21.3):

    olympus (production — 9Router aggregator via its local proxy):
        PATH="$HOME/.local/bin:$PATH" hermes --profile clio \
            -z "Reply with the single word OK."
        # exit 0, stdout "OK" — ~27s (glm-5.3-flash). NINE_ROUTER_API_KEY
        # resolves from olympus's ~/.hermes/.env. From cron-like shells the
        # PATH prefix (or the fallbacks below) is what finds the binary.

    athena (build box — same provider over an SSH tunnel):
        ssh -fN -L 20128:127.0.0.1:20128 olympus
        NINE_ROUTER_API_KEY must be exported in the process environment
        here — this box's hermes does not auto-load ~/.hermes/.env for -z
        runs (verified 2026-10-10).

Provider/model selection lives in the clio profile's config.yaml (the
intended home on every box — the chokepoint stays configuration-free).

The chokepoint enforces the timeout itself (see ``_run_transport``): the
timeout belongs to the caller of the process, not to the process, so a run
that dies mid-turn still ends in a recorded failure (08 §20 writer
contract). Every invocation writes a start event and exactly one terminal
``agent_invoke_result`` event — outcome ``ok|timeout|error|
predicate_failed`` — so silence can never pass for success (02 §6).
"""

import os
import shutil
import sqlite3
import subprocess
import threading
import time
import uuid
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from subprocess import TimeoutExpired as InvokeTimeout
from typing import Literal

from app import db
from app.db import insert_event

Outcome = Literal["ok", "timeout", "error", "predicate_failed"]

# InvokeTimeout is the transport's deadline error, re-exported so callers
# and tests can reference it without naming the spawn machinery themselves.
__all__ = [
    "InvokeResult",
    "InvokeTimeout",
    "Outcome",
    "SuccessPredicate",
    "agent_invoke",
    "default_success_predicate",
]

START_KIND = "agent_invoke_started"
RESULT_KIND = "agent_invoke_result"

SuccessPredicate = Callable[[str, int | None], bool]

_profile_locks: dict[str, threading.Lock] = {}
_locks_guard = threading.Lock()


@dataclass(frozen=True)
class InvokeResult:
    outcome: Outcome
    exit_code: int | None
    stdout: str
    duration_ms: int
    predicate_result: bool
    external_ref: str


def default_success_predicate(stdout: str, exit_code: int | None) -> bool:
    """Caller-supplied predicates ride on top of this floor: exit 0."""
    return exit_code == 0


def _lock_for(profile: str) -> threading.Lock:
    with _locks_guard:
        return _profile_locks.setdefault(profile, threading.Lock())


def _which(name: str) -> str | None:
    """Indirection for tests; keeps the law-12 resolution in one place."""
    return shutil.which(name)


def _resolve_transport() -> tuple[list[str] | None, dict[str, str]]:
    """Primary: ``hermes`` from PATH. Fallbacks (law 12: still one spawn
    site), in order: ``$HERMES_HOME/bin/hermes`` with HERMES_HOME exported,
    then the standard user install ``$HOME/.local/bin/hermes`` — olympus's
    cron shells and systemd units carry neither ``~/.local/bin`` in PATH
    nor a ``~/.hermes/bin`` (observed 2026-10-10). Returns
    (argv-prefix-or-None, env)."""
    env = dict(os.environ)
    resolved = _which("hermes")
    if resolved:
        return [resolved], env
    home = os.environ.get("HERMES_HOME", "")
    if home:
        candidate = Path(home) / "bin" / "hermes"
        if candidate.is_file():
            env["HERMES_HOME"] = home
            return [str(candidate)], env
    local_install = Path.home() / ".local" / "bin" / "hermes"
    if local_install.is_file():
        return [str(local_install)], env
    return None, env


def _run_transport(
    cmd: list[str], timeout_s: float, env: dict[str, str]
) -> subprocess.CompletedProcess[str]:
    """The single spawn site in the repo. The timeout belongs to the caller
    of the process (08 §20): subprocess.run kills on the deadline and raises
    past it, so a hung run still reaches the recorded-failure path."""
    return subprocess.run(
        cmd, capture_output=True, text=True, timeout=timeout_s, env=env, check=False
    )


def _terminal_event(
    conn: sqlite3.Connection,
    external_ref: str,
    profile: str,
    outcome: Outcome,
    duration_ms: int,
    predicate_result: bool,
    exit_code: int | None,
) -> None:
    insert_event(
        conn,
        kind=RESULT_KIND,
        origin="agent-write",
        source_id=None,  # source-less agent event: ref uniqueness is ours
        external_ref=external_ref,
        actor=profile,
        payload={
            "profile": profile,
            "outcome": outcome,
            "duration_ms": duration_ms,
            "predicate_result": predicate_result,
            "exit_code": exit_code,
        },
    )


def _invoke_once(
    conn: sqlite3.Connection,
    profile: str,
    prompt: str,
    timeout: float,
    success_predicate: SuccessPredicate | None,
) -> InvokeResult:
    external_ref = uuid.uuid4().hex
    started = time.monotonic()
    insert_event(
        conn,
        kind=START_KIND,
        origin="agent-write",
        source_id=None,  # source-less agent event: ref uniqueness is ours
        external_ref=external_ref,
        actor=profile,
        payload={"profile": profile, "timeout_s": timeout},
    )

    cmd, env = _resolve_transport()
    if cmd is None:
        # No transport resolvable from this environment — record the
        # failure, never silence (02 §6).
        duration_ms = int((time.monotonic() - started) * 1000)
        _terminal_event(conn, external_ref, profile, "error", duration_ms, False, None)
        return InvokeResult("error", None, "", duration_ms, False, external_ref)

    argv = [*cmd, "--profile", profile, "-z", prompt]
    try:
        proc = _run_transport(argv, timeout, env)
    except InvokeTimeout as exc:
        duration_ms = int((time.monotonic() - started) * 1000)
        partial = exc.stdout or ""
        if isinstance(partial, bytes):
            partial = partial.decode(errors="replace")
        # Timeout and non-zero exit record failure — nothing on any path
        # can read as success (02 §6; law 1 applied to invocations).
        _terminal_event(conn, external_ref, profile, "timeout", duration_ms, False, None)
        return InvokeResult("timeout", None, partial, duration_ms, False, external_ref)

    duration_ms = int((time.monotonic() - started) * 1000)
    exit_code: int | None = proc.returncode
    if exit_code != 0:
        outcome: Outcome = "error"
        predicate_result = False
    else:
        predicate = success_predicate or default_success_predicate
        predicate_result = bool(predicate(proc.stdout, exit_code))
        outcome = "ok" if predicate_result else "predicate_failed"
    _terminal_event(
        conn, external_ref, profile, outcome, duration_ms, predicate_result, exit_code
    )
    return InvokeResult(
        outcome, exit_code, proc.stdout, duration_ms, predicate_result, external_ref
    )


@contextmanager
def _session(conn: sqlite3.Connection | None) -> Iterator[sqlite3.Connection]:
    if conn is not None:
        yield conn
    else:
        c = db.connect(db.db_path())
        try:
            yield c
        finally:
            c.close()


def agent_invoke(
    profile: str,
    prompt: str,
    timeout: float = 120.0,
    success_predicate: SuccessPredicate | None = None,
    conn: sqlite3.Connection | None = None,
    max_retries: int = 0,
) -> InvokeResult:
    """Invoke hermes headlessly through the repo's one spawn site.

    Emits exactly one start event and exactly one terminal result event per
    attempt (retry/audit/limits live here and only here; per-profile
    concurrency cap is 1). ``conn`` defaults to the server database; tests
    pass their own.
    """
    with _lock_for(profile), _session(conn) as c:
        result: InvokeResult | None = None
        for _attempt in range(max_retries + 1):
            result = _invoke_once(c, profile, prompt, timeout, success_predicate)
            if result.outcome == "ok":
                return result
        assert result is not None  # loop runs at least once
        return result
