// Ported verbatim from client/src/routes/routes.test.tsx (the web
// `routes.test.tsx` the M1 exit test counts against). One entry per route
// in 04-screens-pwa.md's route map; the mobile shell serves exactly these
// paths, so a screen dropped on either side shows up here.

// The wake route alone sits outside the Shell (law 9).
export interface RouteCase {
  path: string;
  /** Text the stub must render. */
  expected: string;
  /** The wake route alone sits outside the Shell (law 9). */
  chrome: boolean;
}

export const ROUTE_MAP: readonly RouteCase[] = [
  { path: "/", expected: "Today's Plan", chrome: true },
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

/** The capture FAB's contextual tap (two-tap law, 02 §2 law 8): one tap
    is the OBVIOUS write for the page you're on — on /meals it logs a
    meal, everywhere else it opens the plain capture sheet. The
    hold-to-select fan is untouched: it remains the universal door, and
    this map only changes what a TAP does. One entry per contextual
    page; the glyph and the a11y label derive from the same table, so
    the button always shows what a tap will do. */
export const CAPTURE_CONTEXTS: Readonly<Record<string, string>> = {
  "/meals": "/capture?meal=1",
};

/** The tap target for the page at `pathname` — /capture unless the page
    owns a contextual write. */
export function captureTargetFor(pathname: string): string {
  return CAPTURE_CONTEXTS[pathname] ?? "/capture";
}
