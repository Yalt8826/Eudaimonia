"""Pytest wiring: the real-hermes gate (hardware-gated, like a handset test)
and the staging/vault isolation every test gets for free."""

from pathlib import Path
from typing import Any

import pytest


@pytest.fixture(autouse=True)
def _isolate_writeback_dirs(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Any triage that lands a note calls stage(), whose default is the REAL
    app/staged_writebacks/ — the triage tests leaked pending entries there,
    and ops-deploy's rsync would carry them to olympus for the applier to
    write into the vault. Tests that need specific dirs override these."""
    monkeypatch.setenv("EUDAIMONIA_STAGING", str(tmp_path / "_staging"))
    monkeypatch.setenv("EUDAIMONIA_VAULT", str(tmp_path / "_vault"))


def pytest_addoption(parser: pytest.Parser) -> None:
    parser.addoption(
        "--real-hermes",
        action="store_true",
        default=False,
        help="Run tests that invoke the real hermes binary (needs the clio profile).",
    )


def pytest_collection_modifyitems(config: pytest.Config, items: list[Any]) -> None:
    if config.getoption("--real-hermes"):
        return
    skip = pytest.mark.skip(reason="needs --real-hermes: invokes the real hermes binary")
    for item in items:
        if "real_hermes" in item.keywords:
            item.add_marker(skip)


def pytest_configure(config: pytest.Config) -> None:
    config.addinivalue_line(
        "markers",
        "real_hermes: hardware-gated tests that invoke the real hermes binary",
    )
