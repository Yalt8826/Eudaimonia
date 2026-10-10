#!/usr/bin/env python3
"""Generate the matte skin's black-stock texture for the body background
(01 v2 §2 L0, fidelity pass 2026-10-10).

The reference's skin is crumpled black stock: a very dark base with coarse
folds, medium crumple, fine tooth, and thin bright crack lines. Alpha tricks
over a flat --bg cannot reach that — luminance has to be baked into a raster.
Output: `client/src/assets/skin-black.png`, seamless (integer-frequency plane
waves with random directions — no grid interference), tiled by CSS.

Measured against the reference render: base sits ~L8-14 with fold highlights
to ~L30 and crack lines to ~L45; deep pockets back to ~L4.

Run: `python3 scripts/gen_skin_texture.py` (idempotent — fixed seed).
"""

from __future__ import annotations

import pathlib

import numpy as np
from PIL import Image

SIZE = 512
OUT = pathlib.Path(__file__).resolve().parent.parent / "client/src/assets/skin-black.png"

BASE = 12.0  # the skin's resting luminance (measured: p10-p50 of the field)


def wave_field(
    rng: np.random.Generator,
    size: int,
    spec: list[tuple[int, float]],
    aniso: float = 1.0,
) -> np.ndarray:
    """Sum of plane waves at integer frequencies — seamless, direction-random
    (so octaves never interfere into a plaid). `aniso` > 1 stretches the
    pattern horizontally: real tears carry directional creases."""
    x = np.arange(size)[None, :]
    y = np.arange(size)[:, None]
    acc = np.zeros((size, size))
    for cycles, amplitude in spec:
        # random direction, integer frequency vector in both axes: seamless
        angle = rng.uniform(0.0, np.pi)
        fx = max(1, round(cycles * aniso * abs(np.cos(angle)) + 0.5))
        fy = max(1, round(cycles * abs(np.sin(angle)) + 0.5))
        phase = rng.uniform(0.0, 2.0 * np.pi)
        acc += amplitude * np.sin(x * fx * (2 * np.pi / size) + y * fy * (2 * np.pi / size) + phase)
    return acc


def ridges(rng: np.random.Generator, size: int, strength: float) -> np.ndarray:
    """Thin bright crack lines: ridges of a directional noise field, catching
    light the way hairline cracks do across matte black stock."""
    noise = wave_field(
        rng,
        size,
        [(7, 1.0), (13, 0.8), (29, 0.6), (61, 0.4), (97, 0.3)],
        aniso=1.7,
    )
    thin = np.clip(1.0 - np.abs(noise) / 0.5, 0.0, 1.0)
    return thin * thin * strength


def main() -> None:
    rng = np.random.default_rng(20261010)
    field = (
        wave_field(rng, SIZE, [(1, 2.6), (2, 2.2), (3, 1.8), (5, 1.4)], aniso=1.25)  # folds
        + wave_field(rng, SIZE, [(9, 1.3), (14, 1.0), (21, 0.8)], aniso=1.1)  # crumple
        + wave_field(rng, SIZE, [(47, 0.55), (83, 0.4), (131, 0.3)])  # tooth
    )
    cracks = ridges(rng, SIZE, 16.0)
    speckle = (np.random.default_rng(2).uniform(-1.0, 1.0, (SIZE, SIZE))) * 2.2

    lum = BASE + field + cracks + speckle
    lum = np.clip(lum, 2.5, 52.0)
    lum = 12.0 + (lum - 12.0) * 1.18  # S-curve: deep pockets stay deep, creases pop

    rgb = np.stack([lum, lum, lum * 1.05], axis=-1)  # a breath of blue-black
    data = np.clip(rgb, 0, 255).astype(np.uint8)
    Image.fromarray(data, mode="RGB").save(OUT)
    print(f"wrote {OUT} ({SIZE}x{SIZE}, lum {lum.min():.0f}-{lum.max():.0f})")


if __name__ == "__main__":
    main()
