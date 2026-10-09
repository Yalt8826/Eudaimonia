import type { CSSProperties } from "react";
import { currentPalette, PALETTES, setPalette, type PaletteName } from "../theme/palette";

// /settings stub with the palette picker (T0.4): v2 Matte & Torn default +
// the v1 Aurora archive entry. Flipping calls setPalette — one data-theme
// attribute swap, zero component edits; the tokens live only in theme.css.

const LABELS: Record<PaletteName, string> = {
  "matte-torn": "Matte & Torn (v2 — default)",
  aurora: "Aurora (v1 — archived palette)",
};

const buttonStyle: CSSProperties = {
  display: "block",
  margin: "0.5rem 0",
  padding: "0.75rem 1rem",
  borderRadius: "16px",
  border: "1px solid var(--glass-border)",
  background: "var(--glass-fill)",
  color: "var(--text)",
};

export function SettingsScreen() {
  const active = currentPalette();
  return (
    <main>
      <h1>Settings</h1>
      <section aria-label="Palette">
        <h2>Palette</h2>
        {PALETTES.map((name) => (
          <button
            key={name}
            type="button"
            onClick={() => setPalette(name)}
            aria-pressed={active === name}
            style={buttonStyle}
          >
            {LABELS[name]}
          </button>
        ))}
      </section>
      <p>Widget tokens and sources health arrive with their phases.</p>
    </main>
  );
}
