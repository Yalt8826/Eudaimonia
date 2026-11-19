// The capture tags: the compose rule is the outbox's payload contract —
// the prefix rides at the FRONT (capture.py matches startswith on
// #meal), a user-typed tag is never doubled, no tag composes to the
// plain trimmed text.
import { expect, it } from "@jest/globals";

import { TAGS, composeCapture } from "./captureTags";

it("the meal chip composes the server's contract at the front", () => {
  expect(composeCapture("eggs and toast", "meal")).toBe("#meal eggs and toast");
});

it("the steered tags carry their word so clio lands on the noun", () => {
  expect(composeCapture("buy milk", "task")).toBe("#task buy milk");
  expect(composeCapture("how does dns work", "question")).toBe("#question how does dns work");
  expect(composeCapture("kai owes me the book", "waiting")).toBe("#waiting kai owes me the book");
  expect(composeCapture("the balcony idea", "note")).toBe("#note the balcony idea");
});

it("no tag composes to the trimmed text — nothing is invented", () => {
  expect(composeCapture("  raw thought  ", null)).toBe("raw thought");
});

it("a user-typed tag is never doubled", () => {
  // they typed #meal themselves — the chip adds nothing
  expect(composeCapture("#meal eggs", "meal")).toBe("#meal eggs");
  expect(composeCapture("#MEAL eggs", "meal")).toBe("#MEAL eggs"); // case-insensitive, server matches too
});

it("whitespace around the body is trimmed once, not twice", () => {
  expect(composeCapture("  eggs  ", "meal")).toBe("#meal eggs");
});

it("every tag carries a prefix and a sheet pair — a chip cannot be bare", () => {
  for (const t of TAGS) {
    expect(t.prefix.startsWith("#")).toBe(true);
    expect(t.prefix.length).toBeGreaterThan(1);
    expect(t.paper).toBeTruthy();
    expect(t.ink).toBeTruthy();
  }
});

it("the meal tag is the server's exact contract string", () => {
  // capture.py MEAL_TAG — a drift here silently breaks the Hygeia route
  expect(TAGS.find((t) => t.key === "meal")?.prefix).toBe("#meal");
});
