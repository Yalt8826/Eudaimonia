"""Static-plane server for the public origin (02 §6: the public origin
serves the SPA shell, manifest, and service worker — nothing else).

- SPA fallback: unknown extension-less paths render index.html (deep links).
- /api/* is 404 here by construction: the data plane is tailnet-only
  (frozen decision; EXECUTION.md §3 public-plane allowlist — this file and
  the cloudflared ingress are the grep-able allowlist).
- Binds 127.0.0.1 only; the public reaches it exclusively through the
  Cloudflare Tunnel.

Usage: python3 scripts/serve_static.py [port]   (default 8080)
"""

import http.server
import sys
from pathlib import Path

DIST = Path(__file__).resolve().parents[1] / "client" / "dist"


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIST), **kwargs)

    def end_headers(self):
        # The shell and the SW script must never sit in a heuristic cache:
        # a stale sw.js delays every future update (observed 2026-10-10).
        if self.path in ("/", "/index.html", "/sw.js"):
            self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def send_head(self):
        path = self.path.split("?", 1)[0].split("#", 1)[0]
        if path == "/api" or path.startswith("/api/"):
            self.send_error(404, "the data plane is tailnet-only")
            return None
        last_segment = path.rstrip("/").rsplit("/", 1)[-1]
        candidate = DIST / path.lstrip("/")
        if path != "/" and "." not in last_segment and not candidate.is_file():
            self.path = "/index.html"  # SPA fallback for deep links
        return super().send_head()


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler)
    print(f"serving {DIST} on http://127.0.0.1:{port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
