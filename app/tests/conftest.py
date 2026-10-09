"""Pytest wiring: the real-hermes gate (hardware-gated, like a handset test)."""

from typing import Any

import pytest


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
