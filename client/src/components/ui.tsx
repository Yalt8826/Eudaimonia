import type { CSSProperties, ReactNode } from "react";
import { Link } from "react-router-dom";

// Plaza atoms (04 `/` + 01 §1): uppercase letter-spaced section headings,
// mono muted coverage lines with fixed state dots, amber count badges, and
// shared rows. Colors ride tokens only — the accent/state greps hold here.

const mono: CSSProperties = {
  fontFamily: '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
};

export function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h2
      style={{
        ...mono,
        margin: 0,
        fontSize: "0.8125rem",
        fontWeight: 600,
        letterSpacing: "0.18em",
        textTransform: "uppercase",
        color: "inherit",
      }}
    >
      {children}
    </h2>
  );
}

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        ...mono,
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: "1.5rem",
        height: "1.5rem",
        padding: "0 0.35rem",
        borderRadius: "6px",
        background: "var(--paused-glass)",
        color: "var(--bg)",
        fontSize: "0.8125rem",
        fontWeight: 600,
      }}
    >
      {children}
    </span>
  );
}

export type DotTone = "muted" | "amber" | "alive" | "dead";

// The GLASS state pair, because the dot sits in a glass well — see below.
const DOT_TOKEN: Record<DotTone, string> = {
  muted: "var(--muted)",
  amber: "var(--paused-glass)",
  alive: "var(--alive-glass)",
  dead: "var(--dead-glass)",
};

/**
 * A liveness dot in its own glass well — the self-glass law (01 §5),
 * generalised from widgets to tinted sheets (amendment 2026-10-10).
 *
 * The paper state pair was calibrated on cream and falls under the 3.0
 * non-text floor on the saturated section tints (alive measures 2.26 on
 * mint, 1.53 on violet). Rather than soften the floor or pale the tints,
 * the dot gets the same treatment a widget gets on an unknown wallpaper: a
 * small well back down to the matte skin, which is a calibrated surface, so
 * the dot carries the GLASS pair at alive 6.85 · dead 5.19 · paused 6.89 ·
 * dormant 6.15. Liveness stays truthful on any tint.
 */
export function Dot({ tone = "muted" }: { tone?: DotTone }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        width: "1.15rem",
        height: "1.15rem",
        borderRadius: "9999px",
        background: "var(--dot-well)",
        border: "1px solid var(--glass-border)",
        flex: "0 0 auto",
      }}
    >
      <span
        style={{
          display: "block",
          width: "0.5rem",
          height: "0.5rem",
          borderRadius: "9999px",
          background: DOT_TOKEN[tone],
        }}
      />
    </span>
  );
}

export function CoverageLine({ children }: { children: ReactNode }) {
  return (
    <p
      style={{
        ...mono,
        margin: 0,
        fontSize: "0.8125rem",
        lineHeight: 1.6,
        color: "inherit",
        opacity: 0.72,
      }}
    >
      {children}
    </p>
  );
}

export function Chevron() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" style={{ flex: "0 0 auto" }}>
      <path
        d="m9 5 7 7-7 7"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.65}
      />
    </svg>
  );
}

export function Row({
  to,
  dot,
  icon,
  title,
  subtitle,
}: {
  to: string;
  dot?: ReactNode;
  icon?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
}) {
  const rowStyle: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: "0.7rem",
    padding: "0.55rem 0",
    color: "inherit",
    textDecoration: "none",
    minHeight: "2.75rem",
  };
  return (
    <Link to={to} style={rowStyle}>
      {dot}
      {icon}
      <span style={{ display: "grid", gap: "0.1rem", flex: "1 1 auto", minWidth: 0 }}>
        <span style={{ fontSize: "0.95rem", fontWeight: 500, ...mono }}>{title}</span>
        {subtitle !== undefined ? (
          <span style={{ ...mono, fontSize: "0.78rem", opacity: 0.7 }}>{subtitle}</span>
        ) : null}
      </span>
      <Chevron />
    </Link>
  );
}

export function Pill({
  to,
  children,
  tone = "solid",
}: {
  to: string;
  children: ReactNode;
  tone?: "solid" | "outline";
}) {
  const base: CSSProperties = {
    ...mono,
    display: "inline-flex",
    alignItems: "center",
    gap: "0.45rem",
    padding: "0.5rem 0.9rem",
    borderRadius: "9999px",
    fontSize: "0.8125rem",
    letterSpacing: "0.06em",
    textDecoration: "none",
    textTransform: "uppercase",
  };
  return (
    <Link
      to={to}
      style={
        tone === "solid"
          ? {
              ...base,
              background: "color-mix(in srgb, var(--bg) 82%, transparent)",
              border: "1.5px solid var(--accent-1)",
              color: "var(--accent-1)",
            }
          : { ...base, border: "1.5px solid var(--paper-ink)", color: "var(--paper-ink)" }
      }
    >
      {children}
    </Link>
  );
}
