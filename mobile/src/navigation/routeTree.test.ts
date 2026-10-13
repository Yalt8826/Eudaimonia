import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "@jest/globals";

import { ROUTE_MAP } from "./routeMap";

// M3 REVIEW REGRESSION. A jest-only file (`wake.test.tsx`) was written into
// src/app/, where expo-router treats EVERY file as a route. The test file
// entered the device bundle and the app 500'd on launch — while jest and
// tsc both stayed green, because neither of them cares where a file lives.
// It was found only by running the app on a phone.
//
// So the route tree is now asserted directly: every file under src/app is
// either a screen the route map knows about, or one of expo-router's own
// special files. Nothing else may live there — helpers, tests, fixtures
// and constants all belong outside it, or they ship as routes.

const APP_DIR = join(__dirname, "..", "app");

/** expo-router's own files, which are not routes themselves. */
const SPECIAL = /^(_layout|\+not-found|\+html|\+native-intent)\.(tsx|ts|jsx|js)$/;

function walk(dir: string, prefix = ""): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full, `${prefix}${entry}/`);
    return [`${prefix}${entry}`];
  });
}

/** "(shell)/week/[iso].tsx" -> "/week/[iso]" — groups and index collapse. */
function toRoutePattern(file: string): string {
  const withoutExt = file.replace(/\.(tsx|ts|jsx|js)$/, "");
  const segments = withoutExt
    .split("/")
    .filter((s) => !/^\(.*\)$/.test(s)); // route groups are invisible in the URL
  if (segments[segments.length - 1] === "index") segments.pop();
  return `/${segments.join("/")}`;
}

/** "/week/2026-W41" -> "/week/[iso]" shaped comparison. */
function patternOf(path: string): string {
  return path;
}

describe("src/app is a route tree and nothing else", () => {
  const files = walk(APP_DIR);

  it("contains no test, mock or fixture files", () => {
    const strays = files.filter((f) => /\.(test|spec)\.|__tests__|__mocks__|\.fixture\./.test(f));
    expect(strays).toEqual([]);
  });

  it("every file is a known route or an expo-router special file", () => {
    // Patterns the route map covers, with its concrete params generalised.
    const known = new Set<string>();
    for (const route of ROUTE_MAP) {
      known.add(patternOf(route.path));
    }
    const unexplained = files.filter((file) => {
      const base = file.split("/").pop() ?? file;
      if (SPECIAL.test(base)) return false;
      const pattern = toRoutePattern(file);
      // dynamic segments: /week/[iso] matches the map's /week/2026-W41
      const asRegex = new RegExp(
        `^${pattern.replace(/\[[^\]]+\]/g, "[^/]+").replace(/\//g, "\\/")}$`,
      );
      return ![...known].some((k) => asRegex.test(k));
    });
    expect(unexplained).toEqual([]);
  });
});
