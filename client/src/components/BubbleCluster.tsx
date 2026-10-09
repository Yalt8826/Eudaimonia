import type { CSSProperties } from "react";
import { Link, useLocation } from "react-router-dom";

// The bubble cluster (01 §3): floating glass bubbles, bottom-right default —
// its position is driven by the ONE --nav-cluster-inset variable in
// theme.css. The blur budget lives here from birth: this file carries the
// only live blur any screen gets (one occurrence below, on the cluster
// container — glass is for touching only). The cluster is rendered on every
// route EXCEPT /habits/wake (law 9: the wake screen is bare) — see
// routes.tsx, where wake sits outside the Shell.

interface BubbleSpec {
  key: string;
  label: string;
  /** Link target; undefined = the More sheet stub (full route sheet, later phase). */
  to?: string;
}

function currentIsoWeekUrl(now: Date): string {
  const date = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  const dayNumber = date.getUTCDay() || 7; // ISO: Mon=1 .. Sun=7
  date.setUTCDate(date.getUTCDate() + 4 - dayNumber); // the nearest Thursday
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `/week/${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

const clusterStyle: CSSProperties = {
  position: "fixed",
  inset: "var(--nav-cluster-inset)",
  display: "flex",
  alignItems: "center",
  gap: "0.5rem",
  padding: "0.5rem 0.75rem",
  borderRadius: "24px",
  background: "var(--glass-fill)",
  border: "1px solid var(--glass-border)",
  // The one live blur layer per screen (01 §2 L1). Bubbles themselves use a
  // static fill — no per-bubble blur, five bubbles do not mean five layers.
  backdropFilter: "blur(14px) saturate(140%)",
  zIndex: 40,
};

function bubbleStyle(active: boolean): CSSProperties {
  return {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: "3rem",
    minHeight: "3rem",
    padding: "0 0.75rem",
    borderRadius: "9999px",
    border: `1px solid ${active ? "var(--accent-1)" : "transparent"}`,
    // the active-route ring — teal, and never a state hue (01 §3)
    boxShadow: active ? "0 0 0 1px var(--accent-1)" : "none",
    background: "var(--glass-fill)",
    color: "var(--text)",
    textDecoration: "none",
    fontSize: "0.8125rem",
  };
}

export function BubbleCluster() {
  const { pathname } = useLocation();
  const specs: BubbleSpec[] = [
    { key: "plaza", label: "Plaza", to: "/" },
    { key: "inbox", label: "Inbox", to: "/inbox" },
    { key: "capture", label: "＋ capture", to: "/capture" },
    { key: "week", label: "Week", to: currentIsoWeekUrl(new Date()) },
    { key: "more", label: "More" },
  ];
  return (
    <nav data-nav="bubble-cluster" aria-label="Primary" style={clusterStyle}>
      {specs.map((spec) => {
        if (spec.to === undefined) {
          // More opens the full route sheet later; a stub that stays put.
          return (
            <button key={spec.key} type="button" style={bubbleStyle(false)}>
              {spec.label}
            </button>
          );
        }
        const active =
          spec.to === "/"
            ? pathname === "/"
            : pathname === spec.to || pathname.startsWith(`${spec.to}/`);
        return (
          <Link key={spec.key} to={spec.to} style={bubbleStyle(active)}>
            {spec.label}
          </Link>
        );
      })}
    </nav>
  );
}
