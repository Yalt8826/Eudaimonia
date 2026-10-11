#!/usr/bin/env python3
"""Hand-authored torn silhouettes for TornPaperSection.

This REPLACES the sinusoid-driven contour. Summing octaves produces a wave
however many you stack: the spacing is periodic by construction, every
crest resembles its neighbours, and the result reads as a decorative edge
rather than as paper that was ripped. The character that was missing is
not a frequency — it is the irregularity of the event itself.

So the contour is authored as a sequence of points placed by hand, one
lobe at a time, modelling how a sheet actually comes apart:

  - BROAD rounded lobes, 60-130px wide, whose crowns are three points at a
    similar height — a crest written as a single point is a triangle no
    matter how it is smoothed, which is what the second pass looked like
  - a shallow range OVERALL, but not an even one: most of each edge sits
    within about +/-15px while two or three excursions per edge go much
    further. Flattening everything equally (the third pass) traded
    triangles for a band of near-uniform thickness, which the reference
    never is — it is quiet for long stretches and then tears hard
  - LONG shallow runs, 90px and more, where the fibre gave way cleanly;
    the reference spends most of its length quiet and tears hard in a few
    places, rather than tearing evenly everywhere
  - asymmetric flanks — a tear leans the way it was pulled
  - occasional DEEP undercuts, where the path steps BACKWARDS in x so the
    black genuinely overhangs the paper beneath it
  - small secondary tears riding on the flanks of bigger lobes
  - long shallow runs where the fibre gave way cleanly, between the drama

Nothing here is generated or random. Every number was chosen, and any of
them can be nudged in place — that is the point of authoring it.

CONTRACTS, which a retouch must preserve:
  - x spans exactly 0..WIDTH, and the first and last y are EQUAL, so the
    strip tiles seamlessly with mask-repeat: repeat-x
  - y stays inside [MIN_Y, MAX_Y], so the tear never bites past the strip
  - top and bottom carry different tables: a sheet torn top and bottom
    does not tear the same way twice

Run: `python3 scripts/author_tears.py`
"""

from __future__ import annotations

import pathlib

import numpy as np
from PIL import Image

WIDTH = 800
HEIGHT = 112
MIN_Y, MAX_Y = 16.0, 98.0
OUT = pathlib.Path(__file__).resolve().parent.parent / "client/src/assets/paper"

Point = tuple[float, float]

# --- tear A, top edge -------------------------------------------------------
# Reading left to right: a small nicked rise, a lobe that overhangs, a deep
# clean trough, two tall lobes with a nick between them, the first big
# undercut, a long shallow run through the middle, then heavier tearing
# again toward the right.
TEAR_A_TOP: list[Point] = [
    # A shallow, barely-disturbed run to open with.
    (0, 54), (16, 57), (34, 55), (52, 58), (74, 56), (96, 60),
    # A BROAD lobe — the top is three points at a similar height, which is
    # what makes it read as a rounded clump instead of a triangle.
    (118, 64), (140, 72), (160, 79), (178, 77), (196, 71), (214, 62),
    # Down to a moderate trough, with a secondary nick on the way.
    (232, 55), (246, 50), (258, 53), (272, 40), (292, 34), (312, 39),
    # ---- a long shallow run: ~90px where the fibre gave way cleanly ----
    (334, 50), (356, 49), (378, 52), (400, 50), (422, 53), (444, 51),
    # The deepest bite of this edge, and still a shallow one.
    (462, 46), (480, 42), (498, 44), (516, 49),
    # Second broad lobe, rounded top, overhanging on its right flank.
    (538, 56), (560, 63), (580, 72), (598, 76), (614, 74), (626, 66),
    (636, 68), (630, 65),
    (652, 60), (672, 55),
    # ---- a second shallow run into the seam ----
    (692, 57), (714, 54), (736, 58), (756, 63), (772, 60),
    (800, 54),
]

# --- tear A, bottom edge ----------------------------------------------------
# A different rhythm on purpose: the heavy tearing sits left-of-centre here,
# where the top edge is quietest, so the two never echo each other.
TEAR_A_BOTTOM: list[Point] = [
    # Opens shallow, then a wide low trough rather than a sharp valley.
    (0, 58), (22, 55), (44, 58), (66, 54), (88, 50), (108, 45),
    (126, 43), (146, 46), (168, 51),
    # Broad lobe with a rounded crown.
    (190, 57), (212, 63), (232, 72), (250, 78), (266, 75), (282, 64),
    (300, 58), (316, 61), (310, 58),
    (334, 52), (352, 48), (372, 50),
    # ---- long shallow run ----
    (394, 47), (416, 49), (438, 46), (460, 48),
    # Second broad lobe.
    (482, 53), (504, 59), (524, 65), (542, 70), (558, 69), (574, 66),
    (594, 60), (614, 54), (634, 49),
    # The deepest bite, wide-bottomed.
    (652, 38), (668, 33), (686, 38), (706, 50),
    (728, 54), (750, 57), (772, 60),
    (800, 58),
]

TABLES: dict[str, dict[str, list[Point]]] = {
    "a": {"top": TEAR_A_TOP, "bottom": TEAR_A_BOTTOM},
}


def check(points: list[Point], name: str) -> None:
    """The tiling and safety contracts, enforced rather than trusted."""
    assert points[0][0] == 0, f"{name}: must start at x=0"
    assert points[-1][0] == WIDTH, f"{name}: must end at x={WIDTH}"
    assert points[0][1] == points[-1][1], (
        f"{name}: first and last y must match or the tile shows a seam "
        f"({points[0][1]} vs {points[-1][1]})"
    )
    for x, y in points:
        assert MIN_Y <= y <= MAX_Y, f"{name}: y={y} at x={x} escapes [{MIN_Y}, {MAX_Y}]"


def macro(points: list[Point], samples: int) -> np.ndarray:
    """Evaluate the authored lobes densely — the shape, without the fibre.

    Catmull-Rom through every authored point, tangents taken cyclically so
    the curve leaving x=WIDTH matches the one entering x=0. Rounds the
    lobes without moving a single authored point.
    """
    n = len(points)
    xs = np.linspace(0.0, float(WIDTH), samples, endpoint=False)
    out = np.empty(samples)
    seg = 0
    for i, x in enumerate(xs):
        while seg < n - 2 and points[seg + 1][0] < x:
            seg += 1
        p0 = points[seg - 1] if seg > 0 else (points[-2][0] - WIDTH, points[-2][1])
        p1, p2 = points[seg], points[seg + 1]
        p3 = points[seg + 2] if seg + 2 < n else (points[1][0] + WIDTH, points[1][1])
        span = p2[0] - p1[0]
        u = 0.0 if span == 0 else min(max((x - p1[0]) / span, 0.0), 1.0)
        m1 = (p2[1] - p0[1]) / 2.0
        m2 = (p3[1] - p1[1]) / 2.0
        h00 = 2 * u**3 - 3 * u**2 + 1
        h10 = u**3 - 2 * u**2 + u
        h01 = -2 * u**3 + 3 * u**2
        h11 = u**3 - u**2
        out[i] = h00 * p1[1] + h10 * m1 + h01 * p2[1] + h11 * m2
    return out


def fibre(seed: int, samples: int) -> np.ndarray:
    """Micro-roughness along the tear: the fibre, not the shape.

    Deliberately NOT a sum of sinusoids — that is what made the old contour
    periodic. This is irregular value noise at a few px, interpolated, with
    a linear ramp removed so the two ends meet and the strip still tiles.
    Dense BROKEN nicks ride on top — a fringe of fine fibre, not one
    smooth line. A tear catches and jumps, and the edge it leaves is
    granular at 1-3px.
    """
    rng = np.random.default_rng(seed)
    knots = int(samples / 1.6)  # a knot every ~1.6px: the reference's teeth are 2-3px
    coarse = rng.normal(size=knots + 1)
    coarse[-1] = coarse[0]
    rough = np.interp(np.linspace(0, knots, samples, endpoint=False), np.arange(knots + 1), coarse)

    detail = rng.normal(size=samples) * 0.55
    out = rough * 1.35 + detail

    # Nicks: short, irregular, mostly biting IN toward the black.
    for _ in range(260):
        start = int(rng.integers(0, samples))
        width = int(max(1, rng.gamma(1.2, 1.5)))
        depth = rng.uniform(0.8, 3.4) * (1.0 if rng.random() < 0.65 else -1.0)
        idx = (np.arange(start, start + width)) % samples
        shape = np.sin(np.linspace(0, np.pi, width))
        out[idx] -= depth * shape

    ramp = np.linspace(0.0, out[-1] - out[0], samples)
    return out - ramp - out[0] + out[0]


def contour_ys(points: list[Point], seed: int) -> np.ndarray:
    """The drawn boundary: authored lobes carrying authored-scale fibre.

    ONE source of truth. The silhouette SVG and the fringe raster are both
    built from this array, which is the only way the two can align — a
    fringe drawn independently of the mask will drift along the edge and
    read as a stamped-on strip.
    """
    ys = macro(points, WIDTH) + fibre(seed, WIDTH)
    ys = np.clip(ys, MIN_Y, MAX_Y)
    ys[-1] = ys[0]
    return ys


def as_points(ys: np.ndarray) -> list[Point]:
    xs = np.linspace(0.0, float(WIDTH), len(ys), endpoint=False)
    pts = [(float(x), float(y)) for x, y in zip(xs, ys)]
    pts.append((float(WIDTH), float(ys[0])))
    return pts



def fringe_raster(ys: np.ndarray, seed: int, edge: str) -> Image.Image:
    """The fringe: fibre and relief along the cut, transparent everywhere else.

    Drawn from the SAME contour as the mask, so it cannot drift.

    What is visible depends on which side of the tear a pixel falls, and
    that decides what gets drawn where:

      ABOVE the contour the backdrop is the black skin, so only LIGHT
      marks register — these are the relief, the lit edge of the torn
      card, and they are what makes the cut read as thick rather than
      flat. Dark paint there would be invisible.

      BELOW the contour the backdrop is coloured paper, so DARK marks
      register — strands of black fibre overhanging the exposed sheet,
      plus the localized shadow they drop onto it. Irregular along the
      edge, never a uniform band.

    Alpha is zero everywhere else, so the asset never paints over the
    continuous black skin.
    """
    rng = np.random.default_rng(seed)
    rgba = np.zeros((HEIGHT, WIDTH, 4), dtype=np.float64)

    # Density varies slowly along the edge: some stretches tear cleanly,
    # others shed a lot of fibre. Without this it reads as a stamped strip.
    knots = 26
    coarse = rng.uniform(0.25, 1.0, size=knots + 1)
    coarse[-1] = coarse[0]
    density = np.interp(np.linspace(0, knots, WIDTH, endpoint=False), np.arange(knots + 1), coarse)

    def put(x: int, y: float, value: float, alpha: float) -> None:
        yi = int(round(y))
        if 0 <= yi < HEIGHT and 0 <= x < WIDTH and alpha > rgba[yi, x, 3]:
            rgba[yi, x, :3] = value
            rgba[yi, x, 3] = alpha

    for x in range(WIDTH):
        yc = ys[x]
        d = density[x]

        # Relief on the black side: short lit catches on the cut face,
        # strongest in the first 2-3px and gone by about 6.
        if rng.random() < 0.42 * d + 0.08:
            depth = rng.uniform(0.6, 5.2)
            lit = rng.uniform(70, 135) * (0.45 + 0.55 * np.exp(-depth / 2.4))
            put(x, yc - depth, lit, rng.uniform(0.30, 0.85) * (0.4 + 0.6 * d))
        if rng.random() < 0.18 * d:
            put(x, yc - rng.uniform(0.0, 1.6), rng.uniform(110, 165), rng.uniform(0.25, 0.6))

        # Localized shadow on the paper side: irregular, never a band.
        if rng.random() < 0.40:
            for k in range(int(rng.integers(1, 3))):
                put(x, yc + 0.5 + k, 10.0, rng.uniform(0.10, 0.40) * (0.5 + 0.5 * d))

    # Broken fibres overhanging the paper: strands rooted at the tear,
    # leaning, of varied length. SHORT and SPARSE — the first pass ran
    # 1500 strands averaging 4px and the edge read as fur, not as torn
    # card. Torn paper sheds a little fibre; it does not grow a pelt.
    for _ in range(420):
        x0 = int(rng.integers(0, WIDTH))
        d = density[x0]
        if rng.random() > 0.25 + 0.75 * d:
            continue
        length = max(1.0, rng.gamma(1.4, 1.15))
        lean = rng.uniform(-0.55, 0.55)
        thick = 1 if rng.random() < 0.82 else 2
        dark = rng.uniform(10, 38)
        for step in range(int(length)):
            x = int(x0 + lean * step) % WIDTH
            y = ys[x] + 0.5 + step
            fade = (1.0 - step / (length + 0.5)) ** 0.7
            for w in range(thick):
                put(x, y + w, dark, min(0.80, rng.uniform(0.35, 0.80) * fade))

    if edge == "bottom":
        rgba = rgba[::-1, :, :]

    out = np.zeros((HEIGHT, WIDTH, 4), dtype=np.uint8)
    out[..., :3] = np.clip(rgba[..., :3], 0, 255).astype(np.uint8)
    out[..., 3] = np.clip(rgba[..., 3] * 255.0, 0, 255).astype(np.uint8)
    return Image.fromarray(out, mode="RGBA")


def polyline(points: list[Point]) -> str:
    """Emit as line segments: smoothing the fibre away is the failure mode."""
    return " ".join(f"{x:.1f},{y:.1f}" for x, y in points)


def svg(points: list[Point], edge: str) -> str:
    anchor = HEIGHT if edge == "top" else 0
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{WIDTH}" height="{HEIGHT}"\n'
        f'     viewBox="0 0 {WIDTH} {HEIGHT}" role="presentation">\n'
        f"  <!-- Torn silhouette, {edge} edge. HAND-AUTHORED: the point table lives\n"
        f"       in scripts/author_tears.py, one lobe at a time. Retouch either\n"
        f"       there or directly in this path; the only contracts are that x\n"
        f"       spans 0..{WIDTH} and the first and last y match, or the tile seams.\n"
        f"       White keeps paper, transparent removes it. -->\n"
        f'  <path d="M 0,{anchor} L {polyline(points)} L {WIDTH},{anchor} Z" fill="#fff"/>\n'
        f"</svg>\n"
    )


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    for name, edges in TABLES.items():
        for edge, points in edges.items():
            check(points, f"tear-{name}-{edge}")
            seed = 101 if edge == "top" else 211
            ys = contour_ys(points, seed)

            path = OUT / f"tear-{name}-{edge}.svg"
            path.write_text(svg(as_points(ys), edge))
            print(f"wrote {path.name} — {len(points)} authored lobes + fibre")

            # The bottom edge is drawn in top orientation and flipped, so
            # the contour must be flipped to match before drawing on it.
            draw_ys = ys if edge == "top" else (HEIGHT - ys)
            fr = OUT / f"fringe-{name}-{edge}.png"
            fringe_raster(draw_ys, seed + 7, edge).save(fr, optimize=True)
            print(f"wrote {fr.name} — fringe from the same contour, {fr.stat().st_size // 1024}KB")
    print("\ntear-b and tear-c are authored once tear-a is approved as the reference.")


if __name__ == "__main__":
    main()
