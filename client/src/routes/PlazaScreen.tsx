import { Link } from "react-router-dom";
import { Chevron, CoverageLine, Dot, Pill, Row } from "../components/ui";
import { TornPaperSection } from "../components/paper/TornPaperSection";
import { PLAZA_STRIPS } from "./plazaModel";

// The Plaza (04 `/`): the read-only dashboard. Sheets are torn paper over
// the continuous black page (paper/torn-paper.css + assets from
// scripts/gen_paper_assets.py); every strip renders its TRUE state until
// the P1 adapters land — honest uninstrumented lines, never fabricated
// counts (law 7; 09 §2#1's fifth state). The wake chip deep-links the
// precached hard-mode screen (law 9), which works today.

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
    <header className="plaza-header">
      <p className="mono-caption">Today · {todayLabel(now)}</p>
      <h1>Eudaimonia</h1>
      <p className="plaza-tagline">A calmer, more intentional you</p>
      <Link to="/settings" aria-label="Settings" className="plaza-gear">
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
        padding: "0.3rem 0 0.5rem",
      }}
    >
      <Pill to="/habits/wake" tone="solid">
        Wake
      </Pill>
      <span className="mono-caption">wake · not yet instrumented (P2)</span>
      <Pill to="/habits/wake" tone="outline">
        tap when you wake
      </Pill>
    </div>
  );
}

export function PlazaScreen() {
  return (
    <main className="plaza-page">
      <div className="plaza-content">
        <Header />

        {PLAZA_STRIPS.map((strip, index) => (
          <TornPaperSection
            key={strip.id}
            title={strip.title}
            variant={strip.variant}
            index={index}
            rule={"rule" in strip ? (strip.rule as "teal" | "plum") : undefined}
          >
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

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <Link
                to={strip.to}
                aria-label={`${strip.title} — open`}
                className="mono-caption"
                style={{ display: "inline-flex", alignItems: "center", gap: "0.3rem", textDecoration: "none" }}
              >
                open <Chevron />
              </Link>
            </div>
          </TornPaperSection>
        ))}
      </div>
    </main>
  );
}
