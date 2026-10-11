import type { CSSProperties, ReactNode } from "react";
import "./torn-paper.css";

// A sheet of coloured paper exposed where the black skin has been torn away
// (implementation spec §3). The component owns no task logic — it renders
// the surface and gives its children a place to sit.
//
// It also owns no colours, no contours and no textures: every one of those
// is a custom property in torn-paper.css, so a palette change or an asset
// swap never reaches this file.

/** The five section papers (spec §2.1). Tint is section identity, for life. */
export type PaperVariant = "mint" | "sky" | "blush" | "butter" | "lavender";

/** The authored tear contours. Three, so no two sheets share a silhouette. */
export type TearVariant = "a" | "b" | "c";

/**
 * The hue law (01 §4): teal marks where YOU act, plum where AGENTS act.
 * Optional, and most sheets go without — an accent on every section is
 * decoration, not a signal.
 */
export type SectionAccent = "accent-1" | "accent-2";

export interface TornPaperSectionProps {
  title: string;
  variant: PaperVariant;
  /** Which authored contour to tear with. Defaults to `a`. */
  tear?: TearVariant;
  /**
   * Phase into the tiled tear strip, px. Two sheets on the same contour
   * still tear differently, because the strip is seamless and can start
   * anywhere along its width.
   */
  tearOffset?: number;
  /** The hue-law accent, if this section carries one. */
  accent?: SectionAccent;
  children: ReactNode;
  className?: string;
  id?: string;
}

/**
 * The skin's torn cross-section: five bands at 1px steps, outermost
 * first, graded from the open skin down to the lit cut face that meets the
 * paper. Thick stock shows its own thickness along a tear, and that band
 * is what separates a torn sheet from a coloured card with a ragged
 * outline. The steps are 1px because coarser ones separate visibly where
 * the tear runs near-horizontal and read as stair-stepping.
 */
const SKIN_BANDS = [1, 2, 3, 4, 5] as const;

export function TornPaperSection({
  title,
  variant,
  tear = "a",
  tearOffset = 0,
  accent,
  children,
  className = "",
  id,
}: TornPaperSectionProps) {
  const style = { "--tear-x": `${tearOffset}px` } as CSSProperties;
  const classes = [
    "torn-section",
    `torn-section--${variant}`,
    tear === "a" ? "" : `torn-section--tear-${tear}`,
    accent === undefined ? "" : `torn-section--${accent}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section id={id} className={classes} style={style}>
      {SKIN_BANDS.map((band) => (
        <div
          key={band}
          aria-hidden="true"
          className={`torn-section__skin torn-section__skin--${band}`}
        />
      ))}

      <div className="torn-section__paper">
        {/* The skin's edge falling onto the paper below it — inward, because
            the skin is the layer on top. */}
        <div aria-hidden="true" className="torn-section__cast torn-section__cast--top" />
        <div aria-hidden="true" className="torn-section__cast torn-section__cast--bottom" />

        <div className="torn-section__content">
          <h2 className="torn-section__heading">{title}</h2>
          {accent === undefined ? null : (
            <span aria-hidden="true" className="torn-section__accent" />
          )}
          {children}
        </div>
      </div>

      {/* Fibre and relief along the cut, carrying its own alpha — above
          both the paper and the skin, painting over neither. */}
      <div aria-hidden="true" className="torn-section__fringe" />
    </section>
  );
}
