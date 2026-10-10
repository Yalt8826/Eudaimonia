import type { CSSProperties, ReactNode } from "react";
import "./torn-paper.css";

// TornPaperSection — the reusable L2 surface (spec §3): one rendering
// system, per-section color, texture, silhouette and fringe. The component
// carries no task logic: it renders the paper and hosts children.

export type PaperVariant = "mint" | "sky" | "blush" | "butter" | "lavender";

export interface TornPaperSectionProps {
  title: string;
  variant: PaperVariant;
  children: ReactNode;
  className?: string;
  id?: string;
  /** Position in the sheet stack — earlier sheets sit above later ones, so
   * the preceding black fringe overlaps the next paper (spec §5). */
  index?: number;
  /** Accent left-rule on the sheet (hue law: teal you-act, plum agents). */
  rule?: "teal" | "plum";
}

const RULE_COLOR: Record<"teal" | "plum", string> = {
  teal: "var(--accent-1)",
  plum: "var(--accent-2)",
};

export function TornPaperSection({
  title,
  variant,
  children,
  className = "",
  id,
  index = 0,
  rule,
}: TornPaperSectionProps) {
  const style: CSSProperties = { zIndex: 60 - index };
  return (
    <section
      id={id}
      style={style}
      className={`torn-section torn-section--${variant} ${className}`}
    >
      <div className="torn-section__paper" aria-hidden="true" />

      <div className="torn-section__fringe" aria-hidden="true" />

      <div className="torn-section__content">
        {rule !== undefined ? (
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              left: "12px",
              top: "14%",
              bottom: "14%",
              width: "3px",
              borderRadius: "2px",
              background: RULE_COLOR[rule],
            }}
          />
        ) : null}
        <h2 className="torn-section__heading">{title}</h2>

        {children}
      </div>
    </section>
  );
}
