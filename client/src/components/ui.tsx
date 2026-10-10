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
        color: "var(--paper-ink)",
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

export type DotTone = "muted" | "amber";

const DOT_TOKEN: Record<DotTone, string> = {
  muted: "var(--muted)",
  amber: "var(--paused-glass)",
};

export function Dot({ tone = "muted" }: { tone?: DotTone }) {
  return (
    <span
      aria-hidden="true"
      style={{
        display: "inline-block",
        width: "0.7rem",
        height: "0.7rem",
        borderRadius: "9999px",
        background: DOT_TOKEN[tone],
        flex: "0 0 auto",
      }}
    />
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
        color: "var(--paper-ink)",
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
    color: "var(--paper-ink)",
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
