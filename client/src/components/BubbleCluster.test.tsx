import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { BubbleCluster } from "./BubbleCluster";

// The floating glass cluster (spec §7): four destination bubbles + the teal
// ＋ capture action, arranged as a cluster — never a full-width bar. The
// per-bubble blur surfaces are the app's only blur consumers (spec §8).

afterEach(cleanup);

function clusterAt(path: string): HTMLElement {
  const { container } = render(
    <MemoryRouter initialEntries={[path]}>
      <BubbleCluster />
    </MemoryRouter>,
  );
  return container;
}

function source(relative: string): string {
  for (const base of [process.cwd(), join(process.cwd(), "client")]) {
    try {
      return readFileSync(join(base, relative), "utf8");
    } catch {
      // try the next base
    }
  }
  throw new Error(`cannot locate ${relative}`);
}

describe("BubbleNavigation (spec §7)", () => {
  it("renders four destination bubbles plus the ＋ capture action", () => {
    const container = clusterAt("/");
    expect(container.querySelectorAll("a")).toHaveLength(4);
    expect(container.querySelector('a[aria-label="＋ capture"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="More"]')).not.toBeNull();
  });

  it("the ＋ capture bubble carries the teal treatment via its class", () => {
    const container = clusterAt("/");
    const fab = container.querySelector('a[aria-label="＋ capture"]');
    expect(fab?.className).toContain("nav-bubble--add");
  });

  it("rings the active route's bubble", () => {
    const container = clusterAt("/inbox");
    const inbox = container.querySelector('a[aria-label="Inbox"]');
    expect(inbox?.className).toContain("nav-bubble--active");
    const plaza = container.querySelector('a[aria-label="Plaza"]');
    expect(plaza?.className).not.toContain("nav-bubble--active");
  });

  it("More expands the full route sheet, tap again collapses it", () => {
    clusterAt("/");
    expect(screen.queryByText("Questions")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    expect(screen.getByText("Questions")).not.toBeNull();
    expect(screen.getByText("Settings")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "More" }));
    expect(screen.queryByText("Questions")).toBeNull();
  });

  it("blur budget: the two backdrop surfaces live in torn-paper.css only", () => {
    const tsx = source("src/components/BubbleCluster.tsx");
    expect(tsx.match(/backdrop-filter/g)?.length ?? 0).toBe(0);
    const css = source("src/components/paper/torn-paper.css");
    const count = css.match(/(^|[^-])backdrop-filter/g)?.length ?? 0;
    expect(count, "per-bubble + sheet: small, isolated surfaces (spec §8)").toBe(2);
  });
});
