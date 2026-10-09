import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { PRECACHE_URLS } from "./sw/precache";

// The manifest is a contract, not a config file (T0.5). Two of its fields are
// load-bearing beyond P0 and are pinned here because nothing else would catch
// them drifting: the wake route's protocol handler and the standalone display.
//
// The scheme has zero consumers until P6 ("adopts at TWA day — first use, not
// migration", 05 wake lifecycle), which is exactly why it needs a test now —
// a wrong target would sit unnoticed for the whole build and surface as a
// failing T6.6 leg 2 on a handset.

// vitest's import.meta.url is not a file:// URL under jsdom, so anchor on cwd
// (pnpm runs the suites from client/) with a repo-root fallback.
function readRepoFile(relative: string): string {
  for (const base of [process.cwd(), join(process.cwd(), "client")]) {
    try {
      return readFileSync(join(base, relative), "utf8");
    } catch {
      // try the next base
    }
  }
  throw new Error(`cannot locate ${relative} from ${process.cwd()}`);
}

interface ProtocolHandler {
  protocol: string;
  url: string;
}

interface Manifest {
  display?: string;
  theme_color?: string;
  background_color?: string;
  start_url?: string;
  scope?: string;
  protocol_handlers?: ProtocolHandler[];
}

const MANIFEST = JSON.parse(readRepoFile("public/manifest.webmanifest")) as Manifest;

/** The one wake surface. Both registration paths must land here (02 §6). */
const WAKE_ROUTE = "/habits/wake";

describe("manifest.webmanifest (T0.5)", () => {
  it("registers the web+eudaimonia scheme", () => {
    const handlers = MANIFEST.protocol_handlers ?? [];
    const schemes = handlers.map((h) => h.protocol);
    expect(schemes, "the frozen scheme must be registered").toContain("web+eudaimonia");
  });

  it("resolves web+eudaimonia to the wake route, never a second surface", () => {
    const handler = (MANIFEST.protocol_handlers ?? []).find(
      (h) => h.protocol === "web+eudaimonia",
    );
    expect(handler).toBeDefined();
    // 02 §6: "Both registration paths resolve to the same precached /wake
    // route. The APK deep-link never becomes a second wake surface" — and
    // T6.2 names this exact target, `/habits/wake?src=pwa`.
    expect(
      handler?.url.startsWith(WAKE_ROUTE),
      `web+eudaimonia must open ${WAKE_ROUTE} (got "${handler?.url}") — ` +
        "a handler pointing anywhere else makes the scheme a second wake " +
        "surface, which 02 §6 forbids and T6.6 leg 2 would fail on a handset",
    ).toBe(true);
  });

  it("points the handler at a route the service worker precaches (law 9)", () => {
    const handler = (MANIFEST.protocol_handlers ?? []).find(
      (h) => h.protocol === "web+eudaimonia",
    );
    const path = (handler?.url ?? "").split("?")[0];
    expect(
      PRECACHE_URLS,
      "the scheme's target must be precached — a hard-mode surface reached " +
        "from a cold tap cannot wait on the network",
    ).toContain(path);
  });

  it("installs standalone on the matte base", () => {
    expect(MANIFEST.display).toBe("standalone");
    expect(MANIFEST.theme_color?.toUpperCase()).toBe("#0B0B0C");
    expect(MANIFEST.background_color?.toUpperCase()).toBe("#0B0B0C");
  });
});
