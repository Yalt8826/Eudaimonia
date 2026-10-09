import type { CSSProperties, ReactNode } from "react";
import grainUrl from "../assets/grain.svg";

// TornSheet — the L2 shared primitive, stub level (01 §2 L2): light paper
// revealed under the matte black skin. P0 ships the calibrated variables
// (--fringe-w, tint, rotation ceiling) and the fringe exclusion zone; the
// torn clip-path art arrives with its calibration surfaces (weekly review,
// nutrition detail) in P4/P3.

/** The five paper tints (01 §1) — tint is taxonomy, never valence. */
export type TornSheetTint = "cream" | "mint" | "sky" | "blush" | "butter";

const TINT_TOKEN: Record<TornSheetTint, string> = {
  cream: "var(--paper-cream)",
  mint: "var(--paper-mint)",
  sky: "var(--paper-sky)",
  blush: "var(--paper-blush)",
  butter: "var(--paper-butter)",
};

export interface TornSheetProps {
  /** Paper tint, selecting one of the five paper tokens from theme.css. */
  tint?: TornSheetTint;
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
  fringeWidth,
  rotationDeg = -0.4,
  className,
  children,
}: TornSheetProps) {
  const rotation = Math.max(-1, Math.min(1, rotationDeg));
  const style = {
    ...(fringeWidth === undefined ? {} : { "--fringe-w": fringeWidth }),
    background: TINT_TOKEN[tint],
    color: "var(--paper-ink)",
    // Fringe exclusion zone (gate 3): padding is derived from --fringe-w,
    // so it is >= the fringe width on every side by construction.
    padding: "calc(var(--fringe-w) * 2)",
    transform: `rotate(${rotation}deg)`,
    boxShadow: "0 2px 0 var(--scrim)",
    position: "relative",
    overflow: "hidden",
    borderRadius: "12px",
  } as CSSProperties;
  return (
    <section className={className} style={style}>
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
    </section>
  );
}
