import { Link } from "react-router-dom";
import { Chevron, CoverageLine, Dot, Pill, Row } from "../components/ui";
import { TornPaperSection } from "../components/paper/TornPaperSection";
import { PLAZA_STRIPS } from "./plazaModel";
import { dailyLine, dateLabel, greetingFor } from "./greeting";

// The Plaza (04 `/`): the read-only dashboard on the shared coverage view.
// Rendered in the torn-paper language per the ratified mockup (2026-10-10).
// Until the P1 adapters land, every strip renders its TRUE state — honest
// uninstrumented lines, never fabricated counts (law 7; T1.6 wires the real
// coverage feed). The wake chip is real today: it deep-links the precached
// hard-mode screen (law 9).

const mono = {
  fontFamily: '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
} as const;


function Header() {
  const now = new Date();
  return (
    // No settings gear here any more — Settings is a bubble in the nav
    // cluster, and the same destination in two places is one too many.
    <header style={{ position: "relative", padding: "0.4rem 1.15rem 1.1rem" }}>
      <p
        style={{
          ...mono,
          margin: 0,
          fontSize: "0.8rem",
          letterSpacing: "0.08em",
          color: "var(--muted)",
        }}
      >
        {dateLabel(now)}
      </p>
      <h1
        style={{
          margin: "0.25rem 0 0.3rem",
          // Clamped: "Good afternoon, Yashas" is 22 characters and wrapped
          // to two lines at 320px, which left the greeting looking broken
          // rather than long.
          fontSize: "clamp(1.4rem, 6.4vw, 1.9rem)",
          fontWeight: 700,
          letterSpacing: "-0.01em",
          // Teal into plum across the greeting. Both ends are measured
          // against --bg in contrast.test.ts; `color` stays set as the
          // fallback for anything that cannot clip a background to text,
          // where transparent text would otherwise disappear entirely.
          color: "var(--accent-1)",
          backgroundImage: "linear-gradient(100deg, var(--accent-1), var(--accent-2))",
          backgroundClip: "text",
          WebkitBackgroundClip: "text",
          WebkitTextFillColor: "transparent",
          width: "fit-content",
        }}
      >
        {greetingFor(now)}
      </h1>
      <p style={{ ...mono, margin: 0, fontSize: "0.8rem", color: "var(--muted)" }}>
        {dailyLine(now)}
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
        // One primitive for all five sheets. Each owns its tint for life
        // and tears with its own contour; where two share a contour the
        // offset phases the tiled strip so they do not show the same
        // lobes in the same places (spec §2.2).
        <TornPaperSection
          key={strip.id}
          id={strip.id}
          title={strip.title}
          variant={strip.variant}
          tear={strip.tear}
          tearOffset={strip.tearOffset}
          accent={strip.accent}
          className="plaza-sheet"
        >
          <div style={{ display: "grid", gap: "0.55rem" }}>
            {strip.wakeChip ? (
              <>
                <WakeChipRow />
                <div style={{ display: "grid" }}>
                  <Row to="/meals" dot={<Dot tone="muted" />} title="Nutrition" subtitle="not yet instrumented" />
                  <Row to="/reading" dot={<Dot tone="amber" />} title="Reading" subtitle="not yet instrumented" />
                </div>
              </>
            ) : null}

            {strip.lines.map((line) => (
              <p
                key={line}
                style={{
                  ...mono,
                  margin: 0,
                  fontSize: "0.8125rem",
                  lineHeight: 1.6,
                  opacity: 0.78,
                }}
              >
                {line}
              </p>
            ))}

            <Link
              to={strip.to}
              aria-label={`${strip.title} — open`}
              style={{
                ...mono,
                justifySelf: "end",
                display: "inline-flex",
                alignItems: "center",
                gap: "0.35rem",
                fontSize: "0.78rem",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "currentColor",
                opacity: 0.72,
                textDecoration: "none",
              }}
            >
              open <Chevron />
            </Link>
          </div>
        </TornPaperSection>
      ))}
    </main>
  );
}
