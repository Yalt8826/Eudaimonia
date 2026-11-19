// The capture tags (T2.3/T2.6 follow-on): single-select classification
// shortcuts rendered as chips between the message box and the send
// button. The COMPOSED capture is what the outbox carries, so the
// prefix logic lives here, testable, not in the screen.
//
// Honesty lines (02 §2): #meal is the server's CONTRACT (capture.py
// MEAL_TAG — the tag IS the human's classification; it skips clio and
// routes straight to Hygeia). The other four carry their word so clio's
// one-of-six classifier lands on the same noun — they steer, they never
// promise; the RECENT list still shows what actually landed.
import { colors } from "../theme/tokens";

export interface TagSpec {
  key: string;
  label: string;
  /** The literal prefix the composed capture carries. */
  prefix: string;
  /** Active state: sheet paper + its own ink (spec palette §2.1). */
  paper: string;
  ink: string;
}

export const TAGS: readonly TagSpec[] = [
  {
    key: "meal",
    label: "meal",
    prefix: "#meal",
    paper: colors["--sheet-butter"],
    ink: colors["--sheet-butter-ink"],
  },
  {
    key: "task",
    label: "task",
    prefix: "#task",
    paper: colors["--sheet-mint"],
    ink: colors["--sheet-mint-ink"],
  },
  {
    key: "question",
    label: "question",
    prefix: "#question",
    paper: colors["--sheet-sky"],
    ink: colors["--sheet-sky-ink"],
  },
  {
    key: "waiting",
    label: "waiting on",
    prefix: "#waiting",
    paper: colors["--sheet-blush"],
    ink: colors["--sheet-blush-ink"],
  },
  {
    key: "note",
    label: "note",
    prefix: "#note",
    paper: colors["--sheet-lavender"],
    ink: colors["--sheet-lavender-ink"],
  },
];

/** The text the outbox carries: the tag's prefix rides at the FRONT
    (capture.py matches `startswith` on #meal) — unless the user typed
    the tag themselves, in which case their text already carries it. */
export function composeCapture(text: string, tagKey: string | null): string {
  const body = text.trim();
  if (tagKey === null) return body;
  const spec = TAGS.find((t) => t.key === tagKey);
  if (spec === undefined) return body;
  if (body.toLowerCase().startsWith(spec.prefix)) return body;
  return `${spec.prefix} ${body}`.trim();
}
