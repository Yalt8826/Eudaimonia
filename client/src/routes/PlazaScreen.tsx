import { Link } from "react-router-dom";
import moonUrl from "../assets/moon.svg";
import {
  Chevron,
  CoverageLine,
  Dot,
  Pill,
  Row,
  SectionHeading,
} from "../components/ui";
import { TornSheet } from "../components/TornSheet";
import { PLAZA_STRIPS } from "./plazaModel";

// The Plaza (04 `/`): the read-only dashboard on the shared coverage view.
// Rendered in the torn-paper language per the ratified mockup (2026-10-10).
// Until the P1 adapters land, every strip renders its TRUE state — honest
// uninstrumented lines, never fabricated counts (law 7; T1.6 wires the real
// coverage feed). The wake chip is real today: it deep-links the precached
// hard-mode screen (law 9).

const mono = {
  fontFamily: '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
} as const;

function todayLabel(now: Date): string {
  return now.toLocaleDateString("en-GB", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function Header() {
  const now = new Date();
  return (
    <header style={{ position: "relative", padding: "0.4rem 0.35rem 1.2rem" }}>
      <img
        src={moonUrl}
        alt=""
        aria-hidden="true"
        style={{ position: "absolute", right: "3.8rem", top: "-0.4rem", width: "6.5rem" }}
      />
      <Link
        to="/settings"
        aria-label="Settings"
        style={{
          position: "absolute",
          right: 0,
          top: "0.6rem",
          width: "3rem",
          height: "3rem",
          borderRadius: "9999px",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--glass-fill)",
          border: "1px solid var(--glass-border)",
          color: "var(--text)",
        }}
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <circle cx="12" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
          <path
            d="M12 3.5v2.2M12 18.3v2.2M4.9 7.8l1.9 1.1M17.2 15.1l1.9 1.1M4.9 16.2l1.9-1.1M17.2 8.9l1.9-1.1"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
          />
        </svg>
      </Link>
      <p
        style={{
          ...mono,
          margin: 0,
          fontSize: "0.85rem",
          letterSpacing: "0.08em",
          color: "var(--muted)",
        }}
      >
        Today · {todayLabel(now)}
      </p>
      <h1
        style={{
          margin: "0.2rem 0 0.25rem",
          fontSize: "1.9rem",
          fontWeight: 700,
          letterSpacing: "-0.01em",
          color: "var(--text)",
        }}
      >
        Eudaimonia
      </h1>
      <p style={{ ...mono, margin: 0, fontSize: "0.8rem", color: "var(--muted)" }}>
        A calmer, more intentional you
      </p>
    </header>
  );
}

function WakeChipRow() {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: "0.6rem",
        flexWrap: "wrap",
        padding: "0.35rem 0 0.55rem",
      }}
    >
      <Pill to="/habits/wake" tone="solid">
        Wake
      </Pill>
      <CoverageLine>wake · not yet instrumented (P2)</CoverageLine>
      <Pill to="/habits/wake" tone="outline">
        tap when you wake
      </Pill>
    </div>
  );
}

export function PlazaScreen() {
  return (
    <main data-plaza style={{ padding: "1.1rem 1rem 9.5rem", display: "grid", gap: "1.4rem" }}>
      <Header />
      {PLAZA_STRIPS.map((strip) => (
        <TornSheet key={strip.id} tint={strip.tint} seed={`plaza:${strip.id}`} rule={strip.rule}>
          <div style={{ display: "grid", gap: "0.55rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              <SectionHeading>{strip.title}</SectionHeading>
              {strip.wakeChip ? null : <span style={{ flex: "1 1 auto" }} />}
              <Link
                to={strip.to}
                aria-label={`${strip.title} — open`}
                style={{ color: "var(--paper-ink)", display: "inline-flex" }}
              >
                <Chevron />
              </Link>
            </div>

            {strip.id === "habits" ? (
              <>
                <WakeChipRow />
                <div style={{ display: "grid" }}>
                  <Row to="/meals" dot={<Dot tone="muted" />} title="Nutrition" subtitle="not yet instrumented" />
                  <Row to="/reading" dot={<Dot tone="amber" />} title="Reading" subtitle="not yet instrumented" />
                </div>
              </>
            ) : null}

            {strip.lines.map((line) => (
              <CoverageLine key={line}>{line}</CoverageLine>
            ))}
          </div>
        </TornSheet>
      ))}
    </main>
  );
}
