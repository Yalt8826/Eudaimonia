// The capture FAB's contextual tap (two-tap law, 02 §2 law 8): one tap
// is the obvious write for the page you're on. The map is the contract —
// the glyph, the a11y label, and the push target all derive from it, so
// the button always shows what a tap will do.
import { expect, it } from "@jest/globals";

import { CAPTURE_CONTEXTS, captureTargetFor, ROUTE_MAP } from "./routeMap";

it("meals owns the meal write: a tap there prefills the meal capture", () => {
  expect(captureTargetFor("/meals")).toBe("/capture?meal=1");
});

it("every other page taps through to the plain capture sheet", () => {
  expect(captureTargetFor("/")).toBe("/capture");
  expect(captureTargetFor("/inbox")).toBe("/capture");
  expect(captureTargetFor("/notes")).toBe("/capture");
  expect(captureTargetFor("/nowhere")).toBe("/capture");
});

it("every contextual target is a route the shell actually serves", () => {
  for (const page of Object.keys(CAPTURE_CONTEXTS)) {
    expect(ROUTE_MAP.some((r) => r.path === page)).toBe(true);
  }
});

it("a contextual target always carries its prefill — never a bare deep link", () => {
  // the whole point of the map is the prefill; a context entry that
  // equals the default would be dead weight lying about being context
  for (const target of Object.values(CAPTURE_CONTEXTS)) {
    expect(target.startsWith("/capture?")).toBe(true);
    expect(target).not.toBe("/capture");
  }
});
