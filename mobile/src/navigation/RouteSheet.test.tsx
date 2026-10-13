import { afterEach, describe, expect, it, jest } from "@jest/globals";
import { render } from "@testing-library/react-native";
import { cleanup, fireEvent, renderRouter, screen, waitFor } from "expo-router/testing-library";

import { RouteSheet, SHEET_ENTRY_COUNT } from "./RouteSheet";

// The More bubble's route sheet (two-tap law, ported from the web
// data-sheet): opens from the folded More bubble, lists every shell route,
// the active one teal, navigates on press and closes.
//
// Test order follows the documented test-host quirk (M3): after ANY
// fireEvent.press, a fresh renderRouter in a LATER test renders the tree
// but text/label queries never find it. So the press-free structural tests
// run FIRST, and everything press-dependent shares one test and one tree.

afterEach(cleanup);

function renderAt(path: string) {
  return renderRouter("./src/app", { initialUrl: path });
}

describe("the route sheet (two-tap law on the Expo client)", () => {
  it("carries every shell route — seventeen entries, web parity", () => {
    expect(SHEET_ENTRY_COUNT).toBe(17);
  });

  it("AT REST only the capture anchor is reachable — the ring is inert", async () => {
    // The whole point of the radial nav: at rest the corner holds ONE
    // button. The five spokes are mounted (they have to be, to animate out
    // of the anchor) but they sit at translate(0,0) directly ON TOP of it,
    // so if they stay interactive they swallow the tap meant for capture
    // and a screen reader offers five buttons that are not on screen.
    await renderAt("/");
    expect(screen.queryByTestId("data-nav")).not.toBeNull();
    expect(screen.getByLabelText("＋ capture")).toBeOnTheScreen();

    // Not reachable by label: the wrapper is aria-hidden while folded, so
    // the accessibility tree offers exactly one button in that corner.
    // This is the assertion, not a limitation of the query — a spoke that
    // CAN be found here is a spoke a screen reader would announce and a
    // finger could hit while it sits invisible on top of capture.
    for (const label of ["More", "Settings", "Plaza", "Week", "Inbox"]) {
      expect(screen.queryByLabelText(label)).toBeNull();
    }
  });

  it("the cluster is still absent from the wake route (law 9)", async () => {
    await renderAt("/habits/wake");
    expect(screen.queryByTestId("data-nav")).toBeNull();
  });

  it("lists every route, and a row closes the sheet before it navigates", async () => {
    // The sheet is no longer reachable by pressing a folded More bubble —
    // at rest there is nothing in that corner but capture. It opens by
    // releasing the radial gesture on the More spoke, which the MODEL
    // asserts (radialModel.test.ts: release on a spoke emits act + fold).
    // Driving the real gesture here is not possible: RNGH's jest utilities
    // need Reanimated's own plumbing, and this suite runs on a hand-written
    // Reanimated stub precisely because the official mock recurses through
    // expo-router's factory (jest.reanimated-mock.js).
    //
    // So each half is tested where it lives: the model proves More ACTS,
    // this proves what the sheet DOES, and routes.test proves every one of
    // these destinations actually resolves.
    const onClose = jest.fn();
    const sheet = await render(<RouteSheet open activePath="/" onClose={onClose} />);

    expect(sheet.getByLabelText("Close route sheet")).toBeOnTheScreen();
    for (const label of ["Questions", "Timeline", "Reading", "Meals", "Agents", "Server"]) {
      expect(sheet.getByLabelText(label)).toBeOnTheScreen();
    }

    // closing BEFORE the push is the ordering that matters: the sheet must
    // not survive the navigation it starts
    fireEvent.press(sheet.getByLabelText("Server"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
