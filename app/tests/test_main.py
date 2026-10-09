"""Contract tests for the server skeleton (T0.1)."""

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import app.main as main


def make_client() -> TestClient:
    return TestClient(main.app)


def test_client_dist_points_at_repo_layout() -> None:
    """Regression (first olympus deploy, 2026-10-10): CLIENT_DIST was computed
    one directory short, so the deployed server 503'd every static path while
    the monkeypatched tests stayed green. Path equality needs no built dist."""
    repo_root = Path(__file__).resolve().parents[2]
    assert repo_root / "client" / "dist" == main.CLIENT_DIST


def test_health_ok() -> None:
    r = make_client().get("/api/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_unknown_api_route_stays_json() -> None:
    """An unmatched /api path must 404 as JSON — never fall through to the SPA shell."""
    r = make_client().get("/api/nope")
    assert r.status_code == 404
    assert r.json()["detail"] == "Not found"


def test_spa_serves_index_for_deep_links(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    (tmp_path / "index.html").write_text("<html><body>eudaimonia</body></html>")
    monkeypatch.setattr(main, "CLIENT_DIST", tmp_path)
    r = make_client().get("/habits/wake")
    assert r.status_code == 200
    assert "eudaimonia" in r.text


def test_spa_serves_existing_file(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    (tmp_path / "index.html").write_text("<html></html>")
    (tmp_path / "sw.js").write_text("// sw")
    monkeypatch.setattr(main, "CLIENT_DIST", tmp_path)
    r = make_client().get("/sw.js")
    assert r.status_code == 200
    assert r.text == "// sw"


def test_spa_never_escapes_dist(
    tmp_path: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    (tmp_path / "index.html").write_text("<html>shell</html>")
    monkeypatch.setattr(main, "CLIENT_DIST", tmp_path)
    r = make_client().get("/..%2F..%2Fetc%2Fpasswd")
    assert r.status_code == 200
    assert "shell" in r.text  # fell back to index.html, not a file outside dist


def test_without_dist_returns_build_hint(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(main, "CLIENT_DIST", Path("/nonexistent-dist"))
    r = make_client().get("/")
    assert r.status_code == 503
    assert "pnpm build" in r.json()["detail"]
