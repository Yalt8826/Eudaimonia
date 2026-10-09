import { useState } from "react";
import type { CSSProperties } from "react";
import { appOutbox } from "../sw/queue";

// Wake screen (04 wake spec; 02 §2 law 9): bare, full-bleed teal, one giant
// target — no nav, no header, no animation, zero live blur of any kind. The
// tap time shown is pre-filled from the client clock; the event's ts is
// captured at tap time by the outbox. Offline it queues silently — never blocks.

type TapMethod = "tap" | "recall";

function formatTapTime(date: Date): string {
  const hh = String(date.getHours()).padStart(2, "0");
  const mm = String(date.getMinutes()).padStart(2, "0");
  return `${hh}:${mm}`;
}

const screenStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "var(--accent-1)",
  color: "var(--bg)",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  gap: "1.5rem",
  padding: "1.5rem",
};

const awakeStyle: CSSProperties = {
  width: "100%",
  height: 96,
  fontSize: "1.75rem",
  fontWeight: 600,
  borderRadius: "16px",
  border: "1px solid var(--bg)",
  background: "var(--bg)",
  color: "var(--accent-1)",
};

const recallStyle: CSSProperties = {
  minHeight: 40,
  background: "transparent",
  border: "none",
  color: "var(--bg)",
  opacity: 0.65,
};

export function WakeScreen() {
  const [openedAt] = useState<Date>(() => new Date());
  const [queued, setQueued] = useState(false);

  const logTap = (method: TapMethod): void => {
    void appOutbox()
      .enqueue("habit_tap", { method })
      .then(() => setQueued(true))
      .catch(() => {
        // never blocks (04 wake spec): a queue-write failure must not wedge
        // the wake screen; it stays usable, "will sync" simply not claimed.
      });
  };

  return (
    <main style={screenStyle}>
      <p style={{ margin: 0, letterSpacing: "0.1em" }}>GOOD MORNING</p>
      <p style={{ margin: 0, opacity: 0.8 }}>{formatTapTime(openedAt)} tap time</p>
      <button type="button" onClick={() => logTap("tap")} style={awakeStyle}>
        I'M AWAKE
      </button>
      <button type="button" onClick={() => logTap("recall")} style={recallStyle}>
        ~recall instead
      </button>
      {queued ? <p role="status">will sync</p> : null}
    </main>
  );
}
