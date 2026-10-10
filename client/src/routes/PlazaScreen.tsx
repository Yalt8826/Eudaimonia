import { Link } from "react-router-dom";
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
    <header style={{ position: "relative", padding: "0.4rem 1.15rem 1rem" }}>
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
    <main
      data-plaza
      style={{
        // Sheets run nearly the full width and their tears very nearly
        // touch: the black between them is the skin showing through a
        // series of tears, not a stack of cards with margins.
        padding: "1.1rem 0 9.5rem",
        // The phone design is the design (04, mockup-ratified). On a wide
        // window the column caps rather than stretching: a sheet spanning
        // 1280px puts its text far outside the 60-70ch measure (01 §6) and
        // strands it against one edge. The real twelve-column wide layout
        // is 05's spec and lands with T1.6.
        width: "min(100%, 34rem)",
        marginInline: "auto",
        display: "grid",
        gap: 0,
        // The tears very nearly interlock; the black between two sheets
        // is one band of skin, not a gutter between cards.
        marginBlock: 0,
      }}
    >
      <Header />
      {PLAZA_STRIPS.map((strip) => (
        <TornSheet
          key={strip.id}
          tint={strip.tint}
          seed={`plaza:${strip.id}`}
          rule={strip.rule}
          className="plaza-sheet"
        >
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
