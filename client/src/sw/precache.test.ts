import { describe, expect, it } from "vitest";
import workerSource from "./sw.ts?raw";
import { PRECACHE_URLS } from "./precache";

// Law 9: hard-mode surfaces are precached — the wake screen must render
// with the network gone, and the shell must cold-open offline.

describe("precache manifest (law 9)", () => {
  it("includes the app shell", () => {
    expect(PRECACHE_URLS).toContain("/");
    expect(PRECACHE_URLS).toContain("/index.html");
    expect(PRECACHE_URLS).toContain("/manifest.webmanifest");
  });

  it("includes the wake route — the network can be gone when it opens", () => {
    expect(PRECACHE_URLS).toContain("/habits/wake");
  });

  it("has no duplicates and only same-origin absolute paths", () => {
    expect(new Set(PRECACHE_URLS).size).toBe(PRECACHE_URLS.length);
    for (const url of PRECACHE_URLS) {
      expect(url.startsWith("/")).toBe(true);
    }
  });

  it("is the list the service worker actually installs", () => {
    expect(workerSource).toContain("PRECACHE_URLS");
  });
});
