// The Plaza's header line. The app's own name used to sit here, which told
// the person using it nothing they did not already know; a greeting and the
// date tell them where they are in their day.
//
// Ported UNCHANGED from client/src/routes/greeting.ts at M2: it is pure
// logic (Date maths and localised formatting, no DOM), it is already
// tested on the web side, and the port's test suite (greeting.test.ts)
// is the same suite re-run, so any drift here shows up as a red build.

/** Whose dashboard this is. One place, so it is one edit. */
const OWNER = "Yashas";

/**
 * Time-of-day greeting. The bands are deliberately wide and the small
 * hours get "Welcome back" rather than "Good night" — someone opening
 * their dashboard at 2am is starting something, not ending it.
 */
export function greetingFor(now: Date): string {
  const hour = now.getHours();
  if (hour >= 5 && hour < 12) return `Good morning, ${OWNER}`;
  if (hour >= 12 && hour < 17) return `Good afternoon, ${OWNER}`;
  if (hour >= 17 && hour < 22) return `Good evening, ${OWNER}`;
  return `Welcome back, ${OWNER}`;
}

/**
 * "Sunday, 11 October" — the long form, because the header has room now.
 *
 * Composed from parts rather than taken from one toLocaleDateString call:
 * en-GB's long form renders "Sunday 11 October" with no comma, and the
 * comma is wanted. Each part is still localised.
 */
export function dateLabel(now: Date): string {
  const weekday = now.toLocaleDateString("en-GB", { weekday: "long" });
  const rest = now.toLocaleDateString("en-GB", { day: "numeric", month: "long" });
  return `${weekday}, ${rest}`;
}

/**
 * The third line. One per day, in order, wrapping forever.
 *
 * Deliberately NOT random: a line that changes when you refresh is
 * decoration, and one that changes at midnight is a small marker of the
 * day passing. Keyed to the local date, so it is stable for the whole day
 * and the same on every screen.
 */
export const DAILY_LINES: readonly string[] = [
  "Your world, connected.",
  "One day at a time, on purpose.",
  "Attention is the whole of it.",
  "Small steps, kept.",
  "Less noise, more signal.",
  "The quiet work compounds.",
  "Begin where you are.",
  "Finish one thing well.",
  "Slow is steady, and steady is fast.",
  "Tend the loops that matter.",
  "A calmer, more intentional you.",
  "Notice, then choose.",
  "Rest is part of the plan.",
  "What you look at, you tend.",
  "Nothing urgent. Everything intentional.",
  "Keep the thread.",
  "Today is enough.",
  "Return, and begin again.",
];

export function dailyLine(now: Date): string {
  // Days since the epoch in LOCAL time: UTC would roll the line over at
  // the wrong moment for anyone east or west of it.
  const local = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const day = Math.floor(local / 86_400_000);
  return DAILY_LINES[((day % DAILY_LINES.length) + DAILY_LINES.length) % DAILY_LINES.length];
}
