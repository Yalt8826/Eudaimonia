#!/usr/bin/env python3
"""Generate the torn-paper edge masks for TornSheet (01 v2 §2 L2).

The sheets are revealed where the black skin tears away, so the ragged
fringe is the black layer's own edge (the placement ruling). CSS clip-path
reads as jagged vector, not torn — paper tears along its fibres, which means
a soft multi-scale boundary plus the odd strand pulled loose. So the edge is
a raster alpha mask, generated here rather than hand-drawn, and committed as
an asset.

Output: `client/src/assets/torn/edge-{top,bottom}-{1..3}.png` — wide strips
tiled with `mask-repeat: repeat-x`, so a sheet's height never stretches its
edge. Three variants keep repeats from reading as a pattern down the page.

Seamless by construction: every octave is an integer-frequency sinusoid over
the strip width, so the left and right ends meet exactly when tiled.

Run: `python3 scripts/gen_torn_edges.py` (idempotent — fixed seeds).
"""

from __future__ import annotations

import pathlib

import numpy as np
from PIL import Image

WIDTH = 1600
HEIGHT = 96
SUPERSAMPLE = 8  # vertical subpixel samples, for an antialiased boundary
OUT = pathlib.Path(__file__).resolve().parent.parent / "client/src/assets/torn"

# Octaves as (cycles across the strip, amplitude in px). The low frequencies
# give the big lazy curve of a tear; the high ones give the grain of it.
# Amplitudes are tuned against the reference render: a tear swings far more
# than a decorative wobble, and a shy edge reads as a torn-paper filter
# rather than as torn paper.
OCTAVES: list[tuple[int, float]] = [
    (1, 11.0),
    (2, 7.5),
    (3, 5.0),
    (5, 3.4),
    (8, 2.2),
    (13, 1.5),
    (21, 1.0),
    (34, 0.7),
    (55, 0.45),
    (89, 0.3),
]


def edge_profile(rng: np.random.Generator, width: int) -> np.ndarray:
    """A periodic multi-octave boundary, in pixels from the strip's middle."""
    x = np.arange(width)
    y = np.zeros(width, dtype=np.float64)
    for cycles, amplitude in OCTAVES:
        phase = rng.uniform(0.0, 2.0 * np.pi)
        y += amplitude * np.sin(2.0 * np.pi * cycles * x / width + phase)
    return y


def fibre_wisps(rng: np.random.Generator, width: int, count: int) -> np.ndarray:
    """Thin strands pulled proud of the tear — what makes it read as paper.

    Each wisp is a narrow raised-cosine bump, wrapped so the strip still
    tiles. They push the boundary outward only (a tear sheds fibres, it does
    not bite neat notches).
    """
    y = np.zeros(width, dtype=np.float64)
    x = np.arange(width)
    for _ in range(count):
        centre = rng.integers(0, width)
        half = int(rng.integers(5, 26))
        height = rng.uniform(3.0, 11.0)
        offset = (x - centre + width // 2) % width - width // 2
        inside = np.abs(offset) <= half
        bump = np.zeros(width)
        bump[inside] = height * 0.5 * (1.0 + np.cos(np.pi * offset[inside] / half))
        y = np.maximum(y, bump)
    return y


def strip(seed: int, flip: bool) -> Image.Image:
    """One edge strip: opaque below the tear, transparent above it."""
    rng = np.random.default_rng(seed)
    boundary = HEIGHT / 2.0 + edge_profile(rng, WIDTH) - fibre_wisps(rng, WIDTH, 34)

    # Supersample vertically: each output row averages SUPERSAMPLE probes, so
    # the boundary lands antialiased instead of stair-stepped.
    rows = np.arange(HEIGHT * SUPERSAMPLE) / SUPERSAMPLE
    coverage = (rows[:, None] >= boundary[None, :]).astype(np.float64)
    alpha = coverage.reshape(HEIGHT, SUPERSAMPLE, WIDTH).mean(axis=1)

    # Fray the last sliver of paper: right at the tear, thin the alpha a
    # little and speckle it, so the boundary has fibre rather than a clean cut.
    distance = np.arange(HEIGHT)[:, None] - boundary[None, :]
    fray = np.clip(distance / 4.5, 0.0, 1.0)
    speckle = rng.uniform(0.70, 1.0, size=(HEIGHT, WIDTH))
    alpha = alpha * (fray + (1.0 - fray) * speckle)

    if flip:
        alpha = alpha[::-1, :]

    data = np.zeros((HEIGHT, WIDTH, 4), dtype=np.uint8)
    data[..., :3] = 255  # white: CSS alpha-masks read the alpha channel
    data[..., 3] = np.clip(alpha * 255.0, 0, 255).astype(np.uint8)
    return Image.fromarray(data, mode="RGBA")


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for variant in (1, 2, 3):
        for name, flip in (("top", False), ("bottom", True)):
            # `top` keeps paper BELOW the tear; `bottom` is its mirror.
            path = OUT / f"edge-{name}-{variant}.png"
            strip(seed=1000 * variant + (7 if flip else 3), flip=flip).save(path, optimize=True)
            print(f"wrote {path.relative_to(OUT.parent.parent.parent.parent)}")


if __name__ == "__main__":
    main()
