// Palette picker mechanics (T0.4). A palette flip is a token edit, never a
// redesign (01 v2 §7 gate 5): setPalette swaps ONE data-theme attribute and
// every component follows through the custom properties in theme.css.
// NO hex values live here — palettes are defined only in client/src/theme.css.

export const PALETTES = ["matte-torn", "aurora"] as const;

export type PaletteName = (typeof PALETTES)[number];

export const DEFAULT_PALETTE: PaletteName = "matte-torn";

export function isPaletteName(value: string): value is PaletteName {
  return (PALETTES as readonly string[]).includes(value);
}

/**
 * Flip the palette by attribute swap. The default palette removes the
 * attribute entirely — the `:root` block in theme.css IS matte-torn, so the
 * default never needs a second copy of its tokens.
 */
export function setPalette(name: PaletteName): void {
  if (typeof document === "undefined") return;
  if (name === DEFAULT_PALETTE) {
    delete document.documentElement.dataset.theme;
    return;
  }
  document.documentElement.dataset.theme = name;
}

/** The palette currently active on the document element. */
export function currentPalette(): PaletteName {
  if (typeof document === "undefined") return DEFAULT_PALETTE;
  const theme = document.documentElement.dataset.theme;
  return theme !== undefined && isPaletteName(theme) ? theme : DEFAULT_PALETTE;
}
