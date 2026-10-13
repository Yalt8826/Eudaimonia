import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeAll, describe, expect, it } from "@jest/globals";
import { cleanup, renderRouter, screen } from "expo-router/testing-library";

import { ROUTE_MAP, type RouteCase } from "./routeMap";

// Unmount the previous router between tests, or every NavigationContainer
// keeps its linking config alive and the run drowns in linking warnings.
afterEach(cleanup);

// Ported from client/src/routes/routes.test.tsx: every route in 04's route
// map renders its stub, through the REAL expo-router file tree (src/app),
// so "renders" and "is reachable" are the same assertion.
// /habits/wake renders with ZERO chrome — the bubble cluster is absent
// from its tree, asserted structurally (no [data-nav] element), never
// visually.

// The M1 route-count assertion reads the web suite itself, so a screen
// added or dropped on EITHER side breaks this test instead of drifting.
const WEB_ROUTES_TEST = join(
  __dirname,
  "..",
  "..",
  "..",
  "client",
  "src",
  "routes",
  "routes.test.tsx",
);

function parseWebRouteCases(source: string): RouteCase[] {
  const block = /const ROUTE_MAP[^=]*=\s*\[([\s\S]*?)\n\];/.exec(source);
  if (block === null) {
    throw new Error("web routes.test.tsx must still declare ROUTE_MAP");
  }
  const cases: RouteCase[] = [];
  for (const m of block[1].matchAll(
    /\{\s*path:\s*"([^"]+)",\s*expected:\s*"([^"]*)",\s*chrome:\s*(true|false),?\s*\}/g,
  )) {
    cases.push({ path: m[1], expected: m[2], chrome: m[3] === "true" });
  }
  return cases;
}

let WEB: RouteCase[] = [];

beforeAll(() => {
  WEB = parseWebRouteCases(readFileSync(WEB_ROUTES_TEST, "utf8"));
});

async function findPresented(text: string) {
  try {
    return await screen.findByText(text);
  } catch {
    return await screen.findByLabelText(text);
  }
}

function renderAt(path: string) {
  // RNTL v14's render is ASYNC, so renderRouter returns a PROMISE with the
  // router inspection methods attached to the promise itself. Await the
  // promise to settle the mount and bind `screen`; query pathname/segments
  // on the promise object (awaiting first dissolves the methods into the
  // bare RNTL result).
  return renderRouter("./src/app", { initialUrl: path });
}

describe("route map (04-screens-pwa)", () => {
  it("route count matches the web routes.test.tsx — no screen silently dropped", () => {
    // THE M1 count assertion: the mobile shell serves exactly the web
    // route map, entry for entry.
    console.log(
      `route count: mobile ${ROUTE_MAP.length} · web ${WEB.length} ` +
        `(${ROUTE_MAP.filter((r) => r.chrome).length} in the shell, ` +
        `${ROUTE_MAP.filter((r) => !r.chrome).length} hard-mode)`,
    );
    expect(WEB.length).toBeGreaterThan(0);
    expect(ROUTE_MAP).toEqual(WEB);
  });

  for (const route of ROUTE_MAP) {
    it(`renders ${route.path}`, async () => {
      const router = renderAt(route.path);
      await router;
      // Text or accessible name: a screen may present a string through a
      // Skia canvas (the wake label does, because Fabric mis-measured it),
      // and what matters is that the string reaches the user either way.
      expect(await findPresented(route.expected)).toBeOnTheScreen();
      expect(router.getPathnameWithParams()).toBe(route.path);
      // chrome rides the Shell on every route except wake. This per-route
      // assertion IS the full sweep — M4 removed a second stacked-render
      // loop over the same map: the M4 cluster (gesture detector + animated
      // bubbles) is heavy enough that nineteen STACKED routers exhausted
      // the test host's heap, and the harness cannot unmount between
      // in-test renders (the next render then comes up empty).
      if (route.chrome) {
        expect(screen.queryByTestId("data-nav")).not.toBeNull();
      } else {
        expect(screen.queryByTestId("data-nav")).toBeNull();
      }
    });
  }

  it("/habits/wake renders with zero chrome — the cluster is structurally absent", async () => {
    await renderAt("/habits/wake");
    expect(screen.queryByTestId("data-nav")).toBeNull();
    expect(await findPresented("I'M AWAKE")).toBeOnTheScreen();
  });
});
