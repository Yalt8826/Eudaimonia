import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { AppRoutes } from "./routes";

// Every route in 04's route map renders its stub without throwing.
// /habits/wake renders with ZERO chrome — the bubble cluster is absent from
// its tree, asserted structurally (no [data-nav] element), never visually.

interface RouteCase {
  path: string;
  /** Text the stub must render. */
  expected: string;
  /** The wake route alone sits outside the Shell (law 9). */
  chrome: boolean;
}

const ROUTE_MAP: readonly RouteCase[] = [
  { path: "/", expected: "Plaza", chrome: true },
  { path: "/inbox", expected: "Inbox", chrome: true },
  { path: "/habits/wake", expected: "I'M AWAKE", chrome: false },
  { path: "/week/2026-W41", expected: "Week", chrome: true },
  { path: "/questions", expected: "Questions", chrome: true },
  { path: "/timeline", expected: "Timeline", chrome: true },
  { path: "/reading", expected: "Reading", chrome: true },
  { path: "/meals", expected: "Meals", chrome: true },
  { path: "/agents", expected: "Agents", chrome: true },
  { path: "/server", expected: "Server", chrome: true },
  { path: "/capture", expected: "Capture", chrome: true },
  { path: "/notes", expected: "Notes", chrome: true },
  { path: "/mail", expected: "Mail", chrome: true },
  { path: "/projects", expected: "Projects", chrome: true },
  { path: "/projects/demo", expected: "Project", chrome: true },
  { path: "/goals", expected: "Goals", chrome: true },
  { path: "/routine", expected: "Routine", chrome: true },
  { path: "/chat", expected: "Chat", chrome: true },
  { path: "/chat/clio", expected: "Chat profile", chrome: true },
  { path: "/settings", expected: "Settings", chrome: true },
];

function renderAt(path: string): HTMLElement {
  const { container } = render(
    <MemoryRouter initialEntries={[path]}>
      <AppRoutes />
    </MemoryRouter>,
  );
  return container;
}

afterEach(cleanup);

describe("route map (04-screens-pwa)", () => {
  for (const route of ROUTE_MAP) {
    it(`renders ${route.path}`, () => {
      const container = renderAt(route.path);
      expect(container.textContent ?? "").toContain(route.expected);
    });
  }

  it("every non-wake route carries the bubble cluster", () => {
    for (const route of ROUTE_MAP.filter((r) => r.chrome)) {
      const container = renderAt(route.path);
      expect(container.querySelector("[data-nav]"), `${route.path} must render chrome`).not.toBeNull();
    }
  });

  it("/habits/wake renders with zero chrome — the cluster is structurally absent", () => {
    const container = renderAt("/habits/wake");
    expect(container.querySelector("[data-nav]")).toBeNull();
    expect(container.textContent ?? "").toContain("I'M AWAKE");
  });
});
