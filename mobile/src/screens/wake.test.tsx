import { afterEach, describe, expect, it } from "@jest/globals";
import { cleanup, fireEvent, renderRouter, screen } from "expo-router/testing-library";

// The wake screen's contract (04 wake spec; web WakeScreen.tsx port): a tap
// enqueues through the real outbox module graph and claims "will sync" —
// never "synced", which would be dishonest offline (failure must not read
// as success, 02 §6). Under jest the native modules are the inert stand-ins
// from jest.setup.js; the enqueue→replay→POST contract itself is measured
// in src/data against real SQLite and injected transports.
//
// Both taps run in ONE test on one tree: a press schedules out-of-act state
// updates (the queued claim resolves on a promise), and a re-render in a
// later test keeps its texts unqueryable — a test-host quirk, not app
// behaviour (the rendered tree provably contains them).

afterEach(cleanup);

it("both taps queue through the outbox and claim only 'will sync'", async () => {
  const router = renderRouter("./src/app", { initialUrl: "/habits/wake" });
  await router;

  expect(router.getPathnameWithParams()).toBe("/habits/wake");
  expect(screen.queryByText("will sync")).toBeNull(); // no claim before any tap

  fireEvent.press(screen.getByLabelText("I'M AWAKE"));
  expect(await screen.findByText("will sync")).toBeOnTheScreen();

  fireEvent.press(screen.getByText("~recall instead")); // the recall path queues too
  expect(await screen.findByText("will sync")).toBeOnTheScreen();
});
