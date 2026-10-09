import { useState, type CSSProperties, type ReactElement } from "react";
import { Link, useLocation } from "react-router-dom";

// The bubble cluster (01 §3, v2 per the ratified mockup 2026-10-10): an
// organic cluster of floating glass bubbles anchored bottom-right by the
// teal ＋ capture FAB (the one FAB). Tap More expands the full route sheet
// (two-tap law). The blur budget lives here: exactly ONE live blur in this
// file, on the expanded sheet's panel — the bubbles themselves are static
// glass fills, five bubbles do not mean five layers. The cluster is rendered
// on every route EXCEPT /habits/wake (law 9) — see routes.tsx.

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
  strokeWidth: 1.5,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

const ICONS = {
  plaza: (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path {...stroke} d="M4 11 12 4l8 7" />
      <path {...stroke} d="M6 9.5V20h12V9.5" />
    </svg>
  ),
  inbox: (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <rect {...stroke} x="5" y="4" width="14" height="17" rx="2" />
      <path {...stroke} d="M9 4.5v4h6v-4M9 12h6M9 16h4" />
    </svg>
  ),
  week: (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <rect {...stroke} x="4" y="5" width="16" height="15" rx="2" />
      <path {...stroke} d="M4 9.5h16M8.5 3v4M15.5 3v4" />
    </svg>
  ),
  more: (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path {...stroke} d="M12 5v14M5 12h14" opacity="0" />
      <circle cx="6" cy="12" r="1.4" fill="currentColor" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" />
      <circle cx="18" cy="12" r="1.4" fill="currentColor" />
    </svg>
  ),
  plus: (
    <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
      <path
        d="M12 5v14M5 12h14"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  ),
} as const;

const containerStyle: CSSProperties = {
  position: "fixed",
  inset: "var(--nav-cluster-inset)",
  width: "10.5rem",
  height: "9rem",
  pointerEvents: "none",
  zIndex: 40,
};

function bubbleShell(size: string): CSSProperties {
  return {
    position: "absolute",
    width: size,
    height: size,
    borderRadius: "9999px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "auto",
    background: "var(--glass-fill)",
    border: "1px solid var(--glass-border)",
    color: "var(--text)",
    boxShadow: "0 3px 8px var(--scrim)",
    textDecoration: "none",
    padding: 0,
    cursor: "pointer",
  };
}

function activeRing(style: CSSProperties, active: boolean): CSSProperties {
  // the active-route ring — teal, and never a state hue (01 §3)
  return active
    ? { ...style, boxShadow: "0 0 0 2px var(--accent-1)" }
    : style;
}

export function BubbleCluster() {
  const { pathname } = useLocation();
  const [sheetOpen, setSheetOpen] = useState(false);

  const isActive = (to: string): boolean =>
    to === "/" ? pathname === "/" : pathname.startsWith(to);

  const bubbles: Array<{
    key: string;
    label: string;
    to?: string;
    icon: ReactElement;
    pos: CSSProperties;
    size: string;
  }> = [
    { key: "more", label: "More", icon: ICONS.more, size: "2.6rem", pos: { right: "5.9rem", bottom: "6.1rem" } },
    { key: "week", label: "Week", to: WEEK_URL, icon: ICONS.week, size: "2.9rem", pos: { right: "3.1rem", bottom: "6.4rem" } },
    { key: "plaza", label: "Plaza", to: "/", icon: ICONS.plaza, size: "3rem", pos: { right: "6.4rem", bottom: "2.9rem" } },
    { key: "inbox", label: "Inbox", to: "/inbox", icon: ICONS.inbox, size: "3rem", pos: { right: "3.2rem", bottom: "3.1rem" } },
    {
      key: "capture",
      label: "＋ capture",
      to: "/capture",
      icon: ICONS.plus,
      size: "4.4rem",
      pos: { right: 0, bottom: 0 },
    },
  ];

  return (
    <nav
      data-nav="bubble-cluster"
      aria-label="Primary"
      style={containerStyle}
    >
      {sheetOpen ? (
        <div
          style={{
            position: "absolute",
            right: "0.25rem",
            bottom: "8.6rem",
            width: "11rem",
            maxHeight: "19rem",
            overflowY: "auto",
            padding: "0.6rem 0.75rem",
            borderRadius: "16px",
            background: "var(--glass-fill)",
            border: "1px solid var(--glass-border)",
            // The one live blur layer per screen (01 §2 L1) — on the sheet
            // that overlays content; the bubbles are static fills.
            backdropFilter: "blur(14px) saturate(140%)",
            display: "grid",
            gap: "0.15rem",
            pointerEvents: "auto",
            boxShadow: "0 6px 16px var(--scrim)",
          }}
        >
          {ROUTE_SHEET.map(([label, to]) => (
            <Link
              key={to}
              to={to}
              onClick={() => setSheetOpen(false)}
              style={{
                color: isActive(to) ? "var(--accent-1)" : "var(--text)",
                textDecoration: "none",
                fontSize: "0.875rem",
                padding: "0.2rem 0.35rem",
                borderRadius: "8px",
              }}
            >
              {label}
            </Link>
          ))}
        </div>
      ) : null}

      {bubbles.map((bubble) => {
        const style = activeRing(
          { ...bubbleShell(bubble.size), ...bubble.pos },
          bubble.to !== undefined && bubble.key !== "capture" && isActive(bubble.to),
        );
        if (bubble.to === undefined) {
          return (
            <button
              key={bubble.key}
              type="button"
              aria-label={bubble.label}
              aria-expanded={sheetOpen}
              onClick={() => setSheetOpen((open) => !open)}
              style={style}
            >
              {bubble.icon}
            </button>
          );
        }
        const fab = bubble.key === "capture";
        return (
          <Link
            key={bubble.key}
            to={bubble.to}
            aria-label={bubble.label}
            style={
              fab
                ? {
                    ...style,
                    background: "var(--accent-1)",
                    border: "1px solid var(--accent-1)",
                    color: "var(--bg)",
                  }
                : style
            }
          >
            {bubble.icon}
          </Link>
        );
      })}
    </nav>
  );
}
