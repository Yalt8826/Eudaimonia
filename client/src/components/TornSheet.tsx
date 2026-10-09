import type { CSSProperties, ReactNode } from "react";
import grainUrl from "../assets/grain.svg";
import { tornClipPath } from "./torn";

// TornSheet — the L2 shared primitive, v2 (01 §2 L2): light paper revealed
// where the matte black skin tears away. The black layer's own jagged rim is
// the fringe (dark framing light, per the placement ruling); text padding is
// computed from --fringe-w so text never sits under the fringe (gate 3).
// Everything here is STATIC: deterministic clip paths seeded per sheet, no
// animation constructs anywhere (gate 4). Shadow is flat — torn paper never
// glows.

/** The paper tints (01 §1 + 2026-10-10 amendment) — taxonomy, never valence. */
export type TornSheetTint =
  | "cream"
  | "mint"
  | "sky"
  | "blush"
  | "butter"
  | "violet";

const TINT_TOKEN: Record<TornSheetTint, string> = {
  cream: "var(--paper-cream)",
  mint: "var(--paper-mint)",
  sky: "var(--paper-sky)",
  blush: "var(--paper-blush)",
  butter: "var(--paper-butter)",
  violet: "var(--paper-violet)",
};

/** Accent left-rule, optional (mockup: teal on the plan sheet). */
export type TornRule = "accent-1" | "accent-2";

const RULE_TOKEN: Record<TornRule, string> = {
  "accent-1": "var(--accent-1)",
  "accent-2": "var(--accent-2)",
};

export interface TornSheetProps {
  /** Paper tint, selecting one of the paper tokens from theme.css. */
  tint?: TornSheetTint;
  /** Deterministic tear shape; same seed, same tear, every render. */
  seed?: string;
  /** Optional accent left-rule (hue law: teal you-act, plum agents-act). */
  rule?: TornRule;
  /**
   * Ragged fringe width, exposed to the sheet as the --fringe-w custom
   * property (defaults to the :root value). Text padding is computed from
   * it — the fringe exclusion zone (gate 3) — so text can never sit under
   * the fringe, whatever width the caller sets.
   */
  fringeWidth?: string;
  /** Static rotation in degrees; clamped to the 1deg ceiling (01 §2 L2). */
  rotationDeg?: number;
  className?: string;
  children: ReactNode;
}

export function TornSheet({
  tint = "cream",
  seed = "eudaimonia",
  rule,
  fringeWidth,
  rotationDeg = -0.4,
  className,
  children,
}: TornSheetProps) {
  const rotation = Math.max(-1, Math.min(1, rotationDeg));
  const paperClip = tornClipPath(seed, 4.5);
  const outerStyle = {
    ...(fringeWidth === undefined ? {} : { "--fringe-w": fringeWidth }),
    position: "relative",
    transform: `rotate(${rotation}deg)`,
    // Flat shadow that follows the torn silhouette (never a glow).
    filter: "drop-shadow(0 4px 5px var(--scrim))",
  } as CSSProperties;

  // The fringe: the black skin's own torn rim, a slightly larger jagged
  // shape behind the paper — dark framing light (placement ruling, 01 §2).
  const fringeStyle: CSSProperties = {
    position: "relative",
    margin: "calc(var(--fringe-w) * 0.6)",
    background: "var(--bg)",
    clipPath: tornClipPath(`${seed}:fringe`, 5.5),
    padding: "var(--fringe-w)",
  };

  const paperStyle: CSSProperties = {
    background: TINT_TOKEN[tint],
    color: "var(--paper-ink)",
    // Fringe exclusion zone (gate 3): padding derives from --fringe-w, so it
    // is >= the fringe width on every side by construction.
    padding: "calc(var(--fringe-w) * 1.5)",
    clipPath: paperClip,
    position: "relative",
    overflow: "hidden",
  };

  return (
    <section className={className} style={outerStyle}>
      <div style={fringeStyle}>
        <div style={paperStyle}>
          {rule !== undefined ? (
            <span
              aria-hidden="true"
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                bottom: 0,
                width: "3px",
                background: RULE_TOKEN[rule],
              }}
            />
          ) : null}
          {/* Grain lighter than the skin's (1% vs the skin's 2%) and static —
              the same asset, which carries no animation constructs (gate 4). */}
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              inset: 0,
              backgroundImage: `url(${grainUrl})`,
              opacity: 0.01,
              pointerEvents: "none",
            }}
          />
          <div style={{ position: "relative" }}>{children}</div>
        </div>
      </div>
    </section>
  );
}
