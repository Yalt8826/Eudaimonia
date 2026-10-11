import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { BubbleCluster } from "./BubbleCluster";

// The cluster: six glass bubbles anchored bottom-left by the ＋ capture
// FAB, laid out on two axes (a column up, a row right), with More
// expanding the full route sheet. Structural assertions only; the wake
// route's bareness lives in routes.test.

afterEach(cleanup);

function clusterAt(path: string): HTMLElement {
  const { container } = render(
    <MemoryRouter initialEntries={[path]}>
      <BubbleCluster />
    </MemoryRouter>,
  );
  return container;
}

function source(): string {
  for (const base of [process.cwd(), join(process.cwd(), "client")]) {
    try {
      return readFileSync(join(base, "src/components/BubbleCluster.tsx"), "utf8");
    } catch {
      // try the next base
    }
  }
  throw new Error("cannot locate BubbleCluster.tsx");
}

describe("BubbleCluster v2 (01 §3, mockup-ratified)", () => {
  it("renders six bubbles including the ＋ capture FAB", () => {
    const container = clusterAt("/");
    // plaza / week / inbox / settings / capture are links; More is a button.
    expect(container.querySelectorAll("a")).toHaveLength(5);
    for (const label of ["＋ capture", "Settings", "Plaza", "Week", "Inbox"]) {
      expect(container.querySelector(`a[aria-label="${label}"]`), label).not.toBeNull();
    }
    expect(container.querySelector('button[aria-label="More"]')).not.toBeNull();
  });

  it("anchors to the BOTTOM-LEFT corner, every bubble hugging the edge", () => {
    const container = clusterAt("/");
    const nav = container.querySelector("[data-nav]") as HTMLElement;
    // The position is one token, so the component must not hard-code a side.
    expect(nav.getAttribute("style") ?? "").toContain("var(--nav-cluster-inset)");
    // Capture sits in the corner itself; everything else is placed off it.
    const fab = container.querySelector('a[aria-label="＋ capture"]') as HTMLElement;
    const style = fab.getAttribute("style") ?? "";
    expect(style, "capture is the corner anchor").toMatch(/left:\s*0/);
    expect(style, "capture is the corner anchor").toMatch(/bottom:\s*0/);
    // No bubble may be placed from the right edge — that was the old anchor.
    for (const el of container.querySelectorAll("a, button")) {
      expect((el as HTMLElement).getAttribute("style") ?? "", el.getAttribute("aria-label") ?? "")
        .not.toMatch(/(^|;)\s*right:/);
    }
  });

  it("the ＋ capture FAB carries the teal accent, not a state hue", () => {
    const container = clusterAt("/");
    const fab = container.querySelector('a[aria-label="＋ capture"]') as HTMLElement;
    const style = fab.getAttribute("style") ?? "";
    expect(style).toContain("var(--accent-1)");
    // It is glass like the rest now: the teal is on the icon, so the FAB
    // must NOT paint accent as its background or border.
    expect(style, "capture is glass, not a solid teal disc").toContain("var(--glass-fill)");
    expect(style).not.toMatch(/background:\s*var\(--accent-1\)/);
  });

  it("rings the active route's bubble in teal", () => {
    const container = clusterAt("/inbox");
    const inbox = container.querySelector('a[aria-label="Inbox"]');
    expect((inbox as HTMLElement).getAttribute("style") ?? "").toContain("var(--accent-1)");
  });

  it("More expands the full route sheet, tap again collapses it", () => {
    const container = clusterAt("/");
    expect(screen.queryByText("Questions")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    expect(screen.getByText("Questions")).not.toBeNull();
    expect(screen.getByText("Settings")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    expect(screen.queryByText("Questions")).toBeNull();
    void container;
  });

  it("declares its blur in exactly two places, and says why (01 §2 L1)", () => {
    // The blur budget — ONE live blur per screen — is knowingly exceeded
    // here at the owner's request (2026-10-12): the bubbles carry real
    // glass now, so an open sheet is seven blurred layers. What this test
    // holds is that the departure stays DECLARED rather than drifting:
    // blur is set once on the shared bubble shell and once on the sheet,
    // never sprinkled per bubble, and the comment explaining the
    // departure stays in the file.
    const src = source();
    const declarations = src.match(/\bbackdropFilter:/g)?.length ?? 0;
    expect(declarations, "blur belongs to the shared shell and the sheet, nowhere else").toBe(2);
    expect(src, "the departure from the blur budget must stay documented").toMatch(
      /BLUR BUDGET[\s\S]*knowingly exceeded/,
    );
  });

  it("kills the tap highlight without killing keyboard focus", () => {
    // The blue rectangle that flashed before navigation is the UA tap
    // highlight. Clearing it must not take the focus ring with it, or
    // keyboard users lose their place entirely.
    const css = (() => {
      for (const base of [process.cwd(), join(process.cwd(), "client")]) {
        try {
          return readFileSync(join(base, "src/components/bubble-cluster.css"), "utf8");
        } catch {
          // try the next base
        }
      }
      throw new Error("cannot locate bubble-cluster.css");
    })();
    expect(css).toMatch(/-webkit-tap-highlight-color:\s*transparent/);
    expect(css, "focus must come back for keyboard").toMatch(/:focus-visible/);
    expect(css).toMatch(/outline:\s*2px solid var\(--accent-1\)/);
  });
});
