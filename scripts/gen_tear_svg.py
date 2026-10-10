#!/usr/bin/env python3
"""Generate the torn silhouettes for TornPaperSection as SVG contours.

The tear's main geometry is VECTOR (implementation spec §2.2, §4.1): it
scales cleanly and survives any section height without the contour being
stretched out of proportion. Fine fibre and the dark edge detail are raster
artwork layered separately (§2.3, §4.2) — a path cannot carry fibre.

Shape of the solution: each tear is a wide, short strip tiled horizontally
(`mask-repeat: repeat-x`) with a solid middle between the top and bottom
strips. A single mask stretched over the whole section would elongate the
tear on a tall section, which §8 calls out; tiling keeps every tear at its
authored proportions however far the content grows.

Seamless by construction: every octave is an integer-frequency sinusoid
over the strip width, so y(0) == y(W) exactly and the tile joins invisibly.

Natural tearing is neither a sine wave nor a zigzag (§2.2), so the contour
carries three things at once:
  - a broad slow swing, which makes the black band's thickness vary
  - mid and fine octaves, the serration
  - heavy-tailed fibre events: strands standing proud, notches bitten in

Output: `client/src/assets/paper/tear-{a,b,c}-{top,bottom}.svg`
Run: `python3 scripts/gen_tear_svg.py` (idempotent — fixed seeds).
"""

from __future__ import annotations

import pathlib

import numpy as np

# AUTHORED AT DISPLAY SIZE. The first pass authored 1600x160 and rendered
# it at 50%, which halved every detail the contour carried and then let the
# renderer antialias it — across four stacked bands that compounds into
# visible stair-stepping and a grey haze where the cut face should be. A
# vector contour only stays crisp if it is drawn at the size it is shown.
WIDTH = 800
HEIGHT = 80
SAMPLES = 3200  # four samples per px, so the contour is sub-pixel accurate
OUT = pathlib.Path(__file__).resolve().parent.parent / "client/src/assets/paper"

# (cycles across the strip, amplitude in px). The low end makes the band's
# thickness vary; the high end is the serration. Both are needed: low-only
# reads as a ribbon, high-only as a straight band with a frayed hairline.
OCTAVES: list[tuple[int, float]] = [
    (1, 10.0),
    (2, 6.5),
    (3, 4.2),
    (5, 2.8),
    (8, 1.9),
    (13, 1.4),
    (21, 1.1),
    (34, 0.9),
    (55, 0.7),
    (89, 0.9),
    (144, 0.8),
    (233, 0.65),
    (377, 0.5),
]


def contour(rng: np.random.Generator) -> np.ndarray:
    """Periodic multi-octave boundary, in px from the strip's middle."""
    x = np.arange(SAMPLES)
    y = np.zeros(SAMPLES, dtype=np.float64)
    for cycles, amplitude in OCTAVES:
        phase = rng.uniform(0.0, 2.0 * np.pi)
        y += amplitude * np.sin(2.0 * np.pi * cycles * x / SAMPLES + phase)
    return y


def fibre_events(rng: np.random.Generator, count: int) -> np.ndarray:
    """Strands standing proud of the tear, and notches bitten into it.

    Sizes are heavy-tailed: mostly small fibres, occasionally a big bite.
    Events push both ways — a tear that only ever bulges outward reads as an
    even scallop, which is the decorative zigzag §2.2 warns against.
    """
    out = np.zeros(SAMPLES, dtype=np.float64)
    x = np.arange(SAMPLES)
    for _ in range(count):
        centre = int(rng.integers(0, SAMPLES))
        half = int(max(2, rng.gamma(1.6, 9.0)))
        depth = rng.uniform(1.2, 5.5)
        outward = rng.random() < 0.6
        offset = (x - centre + SAMPLES // 2) % SAMPLES - SAMPLES // 2
        inside = np.abs(offset) <= half
        bump = np.zeros(SAMPLES)
        bump[inside] = depth * 0.5 * (1.0 + np.cos(np.pi * offset[inside] / half))
        out = np.maximum(out, bump) if outward else np.minimum(out, -bump)
    return out


def simplify(xs: np.ndarray, ys: np.ndarray, tolerance: float = 0.06) -> list[tuple[float, float]]:
    """Drop points that lie within `tolerance` px of the line they bridge.

    Keeps the path readable and small without rounding off the serration.
    """
    keep = [0]
    for i in range(1, len(xs) - 1):
        x0, y0 = xs[keep[-1]], ys[keep[-1]]
        x1, y1 = xs[i + 1], ys[i + 1]
        span = x1 - x0
        predicted = y0 if span == 0 else y0 + (ys[i] * 0 + (y1 - y0)) * (xs[i] - x0) / span
        if abs(ys[i] - predicted) > tolerance:
            keep.append(i)
    keep.append(len(xs) - 1)
    return [(float(xs[i]), float(ys[i])) for i in keep]


def strip(seed: int, flip: bool) -> str:
    rng = np.random.default_rng(seed)
    xs = np.arange(SAMPLES) * (WIDTH / SAMPLES)
    ys = HEIGHT / 2.0 + contour(rng) - fibre_events(rng, 170)
    ys = np.clip(ys, 3.0, HEIGHT - 3.0)
    ys[-1] = ys[0]  # exact seam

    if flip:
        ys = HEIGHT - ys

    points = simplify(xs, ys)
    # Paper is kept on the far side of the tear: below it for a top strip,
    # above it for a bottom strip.
    anchor = HEIGHT if not flip else 0
    body = " ".join(f"{x:.1f},{y:.1f}" for x, y in points)
    path = f"M 0,{anchor} L {body} L {WIDTH:.1f},{anchor} Z"
    edge = "bottom" if flip else "top"
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}"\n'
        f'     viewBox="0 0 {WIDTH} {HEIGHT}" role="presentation">\n'
        f"  <!-- Torn silhouette, {edge} edge. Generated by scripts/gen_tear_svg.py;\n"
        f"       seamless horizontally (integer-frequency octaves), so it tiles with\n"
        f"       mask-repeat: repeat-x. White keeps paper, transparent removes it.\n"
        f"       Retouch freely: paint inside the path to reshape the tear. -->\n"
        f'  <path d="{path}" fill="#fff"/>\n'
        f"</svg>\n"
    )


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, variant in (("a", 1), ("b", 2), ("c", 3)):
        for edge, flip in (("top", False), ("bottom", True)):
            path = OUT / f"tear-{name}-{edge}.svg"
            path.write_text(strip(seed=1000 * variant + (7 if flip else 3), flip=flip))
            print(f"wrote {path.relative_to(OUT.parents[3])} ({path.stat().st_size // 1024}KB)")


if __name__ == "__main__":
    main()
