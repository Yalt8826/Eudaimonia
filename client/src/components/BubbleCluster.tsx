import { useState } from "react";
import { Link, useLocation } from "react-router-dom";

// BubbleNavigation (spec §7): five floating glass bubbles in a compact
// bottom-right cluster — four destinations and the teal ＋ capture action.
// More expands the full route sheet (two-tap law). Styling lives in
// paper/torn-paper.css (.bubble-navigation/.nav-bubble); the per-bubble
// blur surfaces are the app's only blur consumers (spec §8).
// Never rendered on /habits/wake (law 9) — see routes.tsx.

function currentIsoWeekUrl(now: Date): string {
  const date = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNumber = date.getUTCDay() || 7; // ISO: Mon=1 .. Sun=7
  date.setUTCDate(date.getUTCDate() + 4 - dayNumber); // the nearest Thursday
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `/week/${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

const WEEK_URL = currentIsoWeekUrl(new Date());

const ROUTE_SHEET: ReadonlyArray<readonly [string, string]> = [
  ["Plaza", "/"],
  ["Inbox", "/inbox"],
  ["Week", WEEK_URL],
  ["Questions", "/questions"],
  ["Timeline", "/timeline"],
  ["Reading", "/reading"],
  ["Meals", "/meals"],
  ["Agents", "/agents"],
  ["Server", "/server"],
  ["Capture", "/capture"],
  ["Notes", "/notes"],
  ["Mail", "/mail"],
  ["Projects", "/projects"],
  ["Goals", "/goals"],
  ["Routine", "/routine"],
  ["Chat", "/chat"],
  ["Settings", "/settings"],
];

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.7,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const ICONS = {
  plaza: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path {...stroke} d="M4 11 12 4l8 7" />
      <path {...stroke} d="M6 9.5V20h12V9.5" />
    </svg>
  ),
  inbox: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <rect {...stroke} x="5" y="4" width="14" height="17" rx="2" />
      <path {...stroke} d="M9 4.5v4h6v-4M9 12h6M9 16h4" />
    </svg>
  ),
  week: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <rect {...stroke} x="4" y="5" width="16" height="15" rx="2" />
      <path {...stroke} d="M4 9.5h16M8.5 3v4M15.5 3v4" />
    </svg>
  ),
  more: (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <circle cx="6" cy="12" r="1.4" fill="currentColor" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" />
      <circle cx="18" cy="12" r="1.4" fill="currentColor" />
    </svg>
  ),
  plus: (
    <svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true">
      <path
        d="M12 5v14M5 12h14"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  ),
} as const;

export function BubbleCluster() {
  const { pathname } = useLocation();
  const [sheetOpen, setSheetOpen] = useState(false);

  const isActive = (to: string): boolean =>
    to === "/" ? pathname === "/" : pathname.startsWith(to);

  return (
    <nav
      data-nav="bubble-cluster"
      className="bubble-navigation"
      aria-label="Main navigation"
    >
      {sheetOpen ? (
        <div className="nav-sheet">
          {ROUTE_SHEET.map(([label, to]) => (
            <Link
              key={to}
              to={to}
              onClick={() => setSheetOpen(false)}
              className={isActive(to) ? "nav-sheet--active" : undefined}
            >
              {label}
            </Link>
          ))}
        </div>
      ) : null}

      <Link
        to="/"
        aria-label="Plaza"
        title="Plaza"
        className={`nav-bubble nav-bubble--0${isActive("/") ? " nav-bubble--active" : ""}`}
      >
        {ICONS.plaza}
      </Link>
      <Link
        to="/inbox"
        aria-label="Inbox"
        title="Inbox"
        className={`nav-bubble nav-bubble--1${isActive("/inbox") ? " nav-bubble--active" : ""}`}
      >
        {ICONS.inbox}
      </Link>
      <button
        type="button"
        aria-label="More"
        title="More"
        aria-expanded={sheetOpen}
        onClick={() => setSheetOpen((open) => !open)}
        className="nav-bubble nav-bubble--2"
      >
        {ICONS.more}
      </button>
      <Link
        to={WEEK_URL}
        aria-label="Week"
        title="Week"
        className={`nav-bubble nav-bubble--3${pathname.startsWith("/week") ? " nav-bubble--active" : ""}`}
      >
        {ICONS.week}
      </Link>
      <Link
        to="/capture"
        aria-label="＋ capture"
        title="＋ capture"
        className="nav-bubble nav-bubble--add"
      >
        {ICONS.plus}
      </Link>
    </nav>
  );
}
