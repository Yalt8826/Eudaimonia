#!/usr/bin/env python3
"""Capture full-page Plaza renders from the USB phone (M2 harness).

Per width, overrides the display to an exact CSS-px width at a clean DPR,
deep-links the snap mode (?snap — the column rendered unscaled and
snapshotted IN-APP with Skia's makeImageFromView), and receives the PNG
base64 over the adb-reverse tunnel (Expo Go is not debuggable, so the app
cache is unreachable via run-as; a screen capture was abandoned — Expo
Go's stuck bundle-progress pill and transient Skia surface artifacts both
land in compositor captures).

Widths (panel is 1080x2392; wm size can only shrink, never grow):
  320 CSS = 960x2134 @ 480dpi  (DPR 3)
  430 CSS = 860x1914 @ 320dpi  (DPR 2)

Usage:
  python3 scripts/capture_plaza.py --serial 001613557001717 --out /tmp/cap \
      [--port 8083] [--only 320]
"""

import argparse
import base64
import subprocess
import threading
import time
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

ADB = str(Path.home() / "Android/Sdk/platform-tools/adb")
WIDTHS = {
    320: ("960x2134", 480),
    430: ("860x1914", 320),
}
SNAP_PORT = 9955

SERIAL = ""


def sh(*args: str) -> bytes:
    out = subprocess.run([ADB, "-s", SERIAL, *args], check=True, capture_output=True)
    return out.stdout


def wait_for_snap(out: Path, timeout: float = 90) -> None:
    """One-shot HTTP receiver: the app POSTs the PNG base64 to /snap."""
    done = threading.Event()

    class Handler(BaseHTTPRequestHandler):
        def do_POST(self):
            length = int(self.headers.get("content-length", 0))
            body = self.rfile.read(length)
            out.write_bytes(base64.b64decode(body))
            self.send_response(200)
            self.end_headers()
            done.set()

        def log_message(self, *args):
            pass

    server = HTTPServer(("127.0.0.1", SNAP_PORT), Handler)
    server.timeout = 0.5
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        waited = 0.0
        while not done.wait(0.5) and waited < timeout:
            waited += 0.5
        if not done.is_set():
            raise SystemExit(f"no snap arrived within {timeout}s")
    finally:
        server.shutdown()


def main() -> int:
    global SERIAL
    ap = argparse.ArgumentParser()
    ap.add_argument("--serial", required=True)
    ap.add_argument("--out", required=True, type=Path)
    ap.add_argument("--port", type=int, default=8083)
    ap.add_argument("--only", type=int, choices=sorted(WIDTHS), default=None)
    args = ap.parse_args()
    SERIAL = args.serial
    out = args.out
    out.mkdir(parents=True, exist_ok=True)

    for css, (size, density) in sorted(WIDTHS.items()):
        if args.only and css != args.only:
            continue
        sh("shell", "wm", "size", size)
        sh("shell", "wm", "density", str(density))
        time.sleep(2)
        sh("reverse", f"tcp:{SNAP_PORT}", f"tcp:{SNAP_PORT}")
        sh("shell", "am", "force-stop", "host.exp.exponent")
        time.sleep(1)
        sh("reverse", f"tcp:{args.port}", f"tcp:{args.port}")
        sh("shell", "am", "start", "-a", "android.intent.action.VIEW",
           "-d", f"exp://localhost:{args.port}/--/?snap=1")
        target = out / f"plaza-{css}.png"
        wait_for_snap(target)
        print(f"captured {target} ({target.stat().st_size} bytes)")

    sh("shell", "wm", "size", "reset")
    sh("shell", "wm", "density", "reset")
    print("display overrides reset")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
