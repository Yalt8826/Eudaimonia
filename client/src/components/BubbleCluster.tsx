import { useState, type CSSProperties, type ReactElement } from "react";
import { Link, useLocation } from "react-router-dom";
import "./bubble-cluster.css";

// The bubble cluster (01 §3): floating glass bubbles anchored to the
// BOTTOM-RIGHT corner by the ＋ capture FAB. Tap More expands the full route
// sheet (two-tap law). Rendered on every route EXCEPT /habits/wake (law 9)
// — see routes.tsx.
//
// Laid out on two axes rather than scattered: a column rising from capture
// (settings, then more) and a row running LEFT from it (plaza, week,
// inbox), both aligned to capture's centre lines. Every bubble is placed
// from the right edge, so the whole cluster mirrors with one token. The previous version
// placed each bubble at its own hand-tuned offset to read as an "organic
// cluster"; it read as misaligned.
//
// BLUR BUDGET (01 §2 L1) — knowingly exceeded, 2026-10-12, at the owner's
// request. The law allows exactly ONE live blur per screen, and it was
// spent on the expanded route sheet; the bubbles were static glass fills
// precisely so six bubbles would not mean six layers. They now carry real
// backdrop-filter, so an open sheet is seven. Small circles are cheap to
// blur and nothing here animates, but this is a deliberate departure from
// a written law rather than an oversight: if the budget is reinstated,
// this is the file to revert.

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
  settings: (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <circle {...stroke} cx="12" cy="12" r="3.2" />
      <path
        {...stroke}
        d="M12 3.5v2.2M12 18.3v2.2M4.9 7.8l1.9 1.1M17.2 15.1l1.9 1.1M4.9 16.2l1.9-1.1M17.2 8.9l1.9-1.1"
      />
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
  width: "14.6rem",
  height: "11.2rem",
  pointerEvents: "none",
  zIndex: 40,
};

/** Capture's size, and the gap between neighbours. The rest derives. */
const FAB = 4.4;
const DOT = 3;
const GAP = 0.4;
/** Centre a DOT-sized bubble on capture's centre line. */
const ALIGN = `${FAB / 2 - DOT / 2}rem`;

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
    // The fill over a veil, not the fill alone — see --bubble-veil.
    background:
      "linear-gradient(var(--glass-fill), var(--glass-fill)), var(--bubble-veil)",
    border: "1px solid var(--glass-border)",
    backdropFilter: "blur(14px) saturate(140%)",
    WebkitBackdropFilter: "blur(14px) saturate(140%)",
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
    // the column, rising from capture
    { key: "more", label: "More", icon: ICONS.more, size: `${DOT}rem`,
      pos: { right: ALIGN, bottom: `${FAB + GAP + DOT + GAP}rem` } },
    { key: "settings", label: "Settings", to: "/settings", icon: ICONS.settings, size: `${DOT}rem`,
      pos: { right: ALIGN, bottom: `${FAB + GAP}rem` } },
    // the row, running left from capture
    { key: "plaza", label: "Plaza", to: "/", icon: ICONS.plaza, size: `${DOT}rem`,
      pos: { right: `${FAB + GAP}rem`, bottom: ALIGN } },
    { key: "week", label: "Week", to: WEEK_URL, icon: ICONS.week, size: `${DOT}rem`,
      pos: { right: `${FAB + GAP + DOT + GAP}rem`, bottom: ALIGN } },
    { key: "inbox", label: "Inbox", to: "/inbox", icon: ICONS.inbox, size: `${DOT}rem`,
      pos: { right: `${FAB + GAP + 2 * (DOT + GAP)}rem`, bottom: ALIGN } },
    // the anchor, in the corner itself
    { key: "capture", label: "＋ capture", to: "/capture", icon: ICONS.plus,
      size: `${FAB}rem`, pos: { right: 0, bottom: 0 } },
  ];


  return (
    <nav
      data-nav="bubble-cluster"
      aria-label="Primary"
      style={containerStyle}
    >
      {sheetOpen ? (
        <div
          data-sheet=""
          style={{
            position: "absolute",
            right: 0,
            bottom: `${FAB + GAP + 2 * (DOT + GAP)}rem`,
            width: "11rem",
            // Tall enough that the seventeen routes usually need no
            // scrolling at all; it still scrolls on a short screen, but
            // the bar itself is hidden in bubble-cluster.css.
            maxHeight: "min(68vh, 32rem)",
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
            // Capture is glass like every other bubble now. Its teal
            // moved from a solid fill to the icon alone — it still reads
            // as the one action bubble (teal = you act, 01 §4) without
            // being the only opaque thing in a cluster of glass.
            style={fab ? { ...style, color: "var(--accent-1)" } : style}
          >
            {bubble.icon}
          </Link>
        );
      })}
    </nav>
  );
}
