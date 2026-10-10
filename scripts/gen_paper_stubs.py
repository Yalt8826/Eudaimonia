#!/usr/bin/env python3
"""Generate PLACEHOLDER paper assets so the component can be built and
reviewed before the real artwork exists.

THESE ARE STUBS. The implementation spec is explicit that procedural noise
is not an acceptable substitute for photographed or scanned paper fibre
(§1, §2.1), and nothing here pretends otherwise: the files are named
`*.stub.png`, they are deliberately subtle, and the component reaches them
through a single CSS custom property each, so swapping in real artwork is a
one-line change in `torn-paper.css` with no component edit.

What to replace them with:

  paper-fibers.stub.png   ->  a tileable photograph or scan of handmade
                              paper, roughly 1024 square, GREYSCALE and
                              centred on mid-grey so the section tint
                              survives it. Fine fibre, matte, no strong
                              gradients or vignette.

  fringe-fibers.stub.png  ->  dark fibrous edge detail with transparency:
                              short irregular strands, the odd lighter
                              fibre where the torn interior catches light.
                              Tiles horizontally.

Run: `python3 scripts/gen_paper_stubs.py` (idempotent — fixed seeds).
"""

from __future__ import annotations

import pathlib

import numpy as np
from PIL import Image

OUT = pathlib.Path(__file__).resolve().parent.parent / "client/src/assets/paper"
SIZE = 512
FRINGE_W, FRINGE_H = 1024, 96


def _tileable_noise(rng: np.random.Generator, size: int, scale: float) -> np.ndarray:
    """Band-limited noise, tileable by construction and free of structure.

    Built in the frequency domain: white noise, shaped by a radial falloff,
    inverse-transformed. A sum of a handful of sinusoids (the first attempt)
    leaves a visible grid in the tile — few components means regular
    structure, and the eye finds it immediately on a flat sheet.
    """
    spectrum = rng.normal(size=(size, size)) + 1j * rng.normal(size=(size, size))
    fy = np.fft.fftfreq(size)[:, None]
    fx = np.fft.fftfreq(size)[None, :]
    radius = np.sqrt(fx**2 + fy**2)
    with np.errstate(divide="ignore"):
        falloff = np.where(radius == 0, 0.0, np.exp(-((radius / scale) ** 2)) / (radius + 1e-6))
    field = np.real(np.fft.ifft2(spectrum * falloff))
    field -= field.mean()
    peak = np.abs(field).max()
    return field / peak if peak else field


def paper_fibres() -> Image.Image:
    """Greyscale, centred on mid-grey: a tint multiplied through it survives."""
    rng = np.random.default_rng(5)
    fine = _tileable_noise(rng, SIZE, scale=0.16)
    broad = _tileable_noise(rng, SIZE, scale=0.03)
    # Fibre reads as faint broad variation under a finer tooth. Amplitude
    # stays low: this is a placeholder, and a loud stub invites judging the
    # layout against artwork nobody intends to ship.
    field = 0.65 * fine + 0.35 * broad
    grey = np.clip(128 + field * 11.0, 0, 255).astype(np.uint8)
    return Image.fromarray(np.dstack([grey] * 3), mode="RGB")


def fringe_fibres() -> Image.Image:
    """Dark strands with alpha, densest at the top edge, fading downward."""
    rng = np.random.default_rng(11)
    x = np.arange(FRINGE_W)
    alpha = np.zeros((FRINGE_H, FRINGE_W), dtype=np.float64)
    value = np.zeros((FRINGE_H, FRINGE_W), dtype=np.float64)
    for _ in range(900):
        cx = int(rng.integers(0, FRINGE_W))
        length = rng.uniform(4, 26)
        width = max(1, int(rng.gamma(1.4, 1.1)))
        lean = rng.uniform(-0.5, 0.5)
        lit = rng.random() < 0.12  # the odd fibre catching light
        for step in range(int(length)):
            y = step
            if y >= FRINGE_H:
                break
            col = int(cx + lean * step) % FRINGE_W
            fade = max(0.0, 1.0 - step / length)
            for w in range(-width, width + 1):
                c = (col + w) % FRINGE_W
                a = fade * (1.0 - abs(w) / (width + 1)) * rng.uniform(0.5, 1.0)
                if a > alpha[y, c]:
                    alpha[y, c] = a
                    value[y, c] = 0.62 if lit else 0.03
    depth = np.clip(1.0 - np.arange(FRINGE_H) / (FRINGE_H * 0.55), 0, 1)[:, None]
    alpha = alpha * depth
    rgb = np.clip(value * 255, 0, 255).astype(np.uint8)
    data = np.dstack([rgb, rgb, rgb, np.clip(alpha * 255, 0, 255).astype(np.uint8)])
    return Image.fromarray(data, mode="RGBA")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    # The paper surface is real artwork now (see prepare_paper_texture.py);
    # only the fringe is still a placeholder.
    fringe_fibres().save(OUT / "fringe-fibers.stub.png", optimize=True)
    for name in ("fringe-fibers.stub.png",):
        print(f"wrote {name} ({(OUT / name).stat().st_size // 1024}KB) — PLACEHOLDER")


if __name__ == "__main__":
    main()
