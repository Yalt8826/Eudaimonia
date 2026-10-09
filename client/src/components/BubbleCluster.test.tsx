import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { BubbleCluster } from "./BubbleCluster";

// The v2 cluster (mockup 2026-10-10): five bubbles — four glass + the teal
// ＋ capture FAB as the anchor — with More expanding the full route sheet.
// Structural assertions only; the wake route's bareness lives in routes.test.

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
  it("renders five bubbles including the ＋ capture FAB", () => {
    const container = clusterAt("/");
    expect(container.querySelectorAll("a")).toHaveLength(4); // plaza/inbox/week/capture
    expect(container.querySelector('a[aria-label="＋ capture"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="More"]')).not.toBeNull();
  });

  it("the ＋ capture FAB carries the teal accent, not a state hue", () => {
    const container = clusterAt("/");
    const fab = container.querySelector('a[aria-label="＋ capture"]');
    expect((fab as HTMLElement).getAttribute("style") ?? "").toContain("var(--accent-1)");
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

  it("carries exactly ONE live blur — the budgeted layer (01 §2 L1)", () => {
    const occurrences = source().match(/backdropFilter/g)?.length ?? 0;
    expect(occurrences, "five bubbles do not mean five blur layers").toBe(1);
  });
});
