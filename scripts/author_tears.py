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



# The relief treatment: a separate, replaceable block. Nothing here knows
# about the contour's shape or the paper's texture — it only decides how a
# torn fragment is lit and how far it hangs, so the material can be retuned
# or swapped wholesale without regenerating geometry.
# The fringe raster is authored at twice CSS size and drawn back down by
# `background-size` in torn-paper.css. At 1:1 a phone's 3x display
# upscales it and the fine fibre — the smallest and most load-bearing
# detail here — blurs into a smear, which is the look this edge has been
# fighting. Everything measured in pixels below is CSS px; the generator
# multiplies by FRINGE_SCALE, so these numbers stay readable.
FRINGE_SCALE = 2

RELIEF = {
    "fragments": 54,       # attempts per edge; the zone field gates them
    "clump_share": 0.32,   # the few places a whole flake came away
    "clump_w": (26, 68),   # clumps: wide enough for the modelling to read
    "clump_drop": (9.0, 19.0),
    "chip_w": (8, 26),     # chips: the common small fragment
    "chip_drop": (2.5, 7.0),
    "crown": (78, 158),     # the lit ridge where the scrap lifts away
    "lit_share": 0.70,      # of CLUMPS, before the clustering field
    "lit_share_chip": 0.05, # chips stay dark; a lit chip is a bright dot     # how many fragments catch light at all
    "body": (4, 12),       # the dark body it falls to at the tip
    "lean": 0.30,          # how hard the light favours one flank
    "contact": 0.70,
    # The light comes from above. A top edge's cut face tilts up into it;
    # a bottom edge's tilts away, so the same crown brightness on both
    # lights a face that should be in shadow — and a lit rim under the
    # sheet is read as an outline, not as relief.
    "downlight": 0.78,       # the narrow shadow it drops on the paper
}


def slow_field(rng: np.random.Generator, width: int, knots: int) -> np.ndarray:
    """A wrapping 0..1 field: how a stretch of the edge behaves."""
    k = rng.uniform(0.0, 1.0, size=knots + 1)
    k[-1] = k[0]
    return np.interp(np.linspace(0, knots, width, endpoint=False), np.arange(knots + 1), k)


def fringe_raster(ys: np.ndarray, seed: int, edge: str, clumped: bool = True) -> Image.Image:
    """The fringe: the MATERIAL of the cut, transparent everywhere else.

    Drawn from the SAME contour as the mask, so it cannot drift.

    Visibility decides what gets drawn where. Above the contour the
    backdrop is black skin, so light marks read and dark ones are nearly
    invisible — except against the skin's own crinkle, where slightly
    darker marks read as RECESSES. Below the contour the backdrop is
    coloured paper, so dark marks read.

    Torn thick stock has structure at two scales, and the single-scale
    version read as a textured mask rather than paper:

      FINE   individual fibres, 1-3px, shed along the tear
      COARSE clumps and fragments, 5-30px, where the top layer
             delaminated and hangs over the sheet still attached — each
             with its own lit crown and the shadow it drops

    And it is not uniform along its length. Three slow fields decide the
    CHARACTER of each stretch rather than merely its amount: some run
    clean, some shed fibre, some tear away in fragments. An edge that
    does the same thing everywhere is a texture, not an event.
    """
    rng = np.random.default_rng(seed)
    s = FRINGE_SCALE
    lit_gain = 1.0 if edge == "top" else RELIEF["downlight"]
    w_px, h_px = WIDTH * s, HEIGHT * s
    # The same contour, resampled to raster scale. Interpolated, not
    # repeated: a repeated contour stair-steps by a whole CSS pixel and
    # the fringe then sits a step away from the smoothly-scaled SVG edge.
    ys = np.interp(np.arange(WIDTH * s) / s,
                   np.arange(WIDTH + 1), np.append(ys, ys[0])) * s
    rgba = np.zeros((h_px, w_px, 4), dtype=np.float64)

    zone_fibre = slow_field(rng, w_px, 18)
    zone_frag = slow_field(rng, w_px, 11)
    zone_lit = slow_field(rng, w_px, 14)

    def put(x: int, y: float, value: float, alpha: float) -> None:
        yi = int(round(y))
        x %= w_px
        if 0 <= yi < h_px and alpha > rgba[yi, x, 3]:
            rgba[yi, x, :3] = value
            rgba[yi, x, 3] = min(1.0, alpha)

    # 1. (removed) There used to be runs of lit facets hugging the
    #    contour here. They predate the relief and they were the wrong
    #    idea: light placed RELATIVE TO THE CONTOUR follows the contour,
    #    which is the definition of an outline however finely it is
    #    broken up. Light now belongs to fragments, which are discrete
    #    and sparse, so it cannot trace the tear. Measured first: by the
    #    end they were almost entirely overwritten by later marks anyway
    #    (0.1% of columns survived above the contour), so removing them
    #    costs nothing and removes a standing temptation to turn them up.

    # 2. Recesses inside the black: darker than the skin's own crinkle, so
    #    they read as hollows between the lit facets rather than as paint.
    for _ in range(90):
        cx = int(rng.integers(0, w_px))
        w = int(max(3, rng.gamma(2.0, 3.0)) * s)
        d0 = rng.uniform(1.2, 6.0) * s
        for i in range(w):
            xx = (cx + i) % w_px
            fade = np.sin(np.pi * (i + 0.5) / w)
            for k in range(s):
                put(xx, ys[xx] - d0 + k, 0.0, rng.uniform(0.45, 0.85) * fade)

    # 3. COARSE SCALE: fragments of the black layer, delaminated and
    #    hanging over the sheet, still attached at the tear.
    #
    #    Each is MODELLED, not filled. A flat silhouette reads as a mask
    #    however ragged its outline; what makes a fragment read as a
    #    physical scrap is that it turns in the light:
    #
    #      CROWN    the ridge where it lifts away, catching light
    #      BODY     a tonal gradient falling from crown to hanging tip
    #      LEAN     the light comes from one side, so one flank is
    #               brighter than the other across the fragment's width
    #      RECESS   the hollow behind it, darker than the skin's crinkle
    #      CONTACT  a narrow shadow where it overlaps the exposed paper
    #
    #    Fragments are drawn in sequence and allowed to overlap, so some
    #    stretches read as layered scraps rather than a single row.
    if clumped:
        for _ in range(RELIEF["fragments"]):
            cx = int(rng.integers(0, w_px))
            if rng.random() > 0.15 + 0.85 * zone_frag[cx]:
                continue

            # Two tiers. Chips are the common case; clumps are the few
            # places where a whole flake of the top layer came away, and
            # they are the only fragments large enough for the modelling
            # below to read at all. A fragment is WIDER THAN IT HANGS —
            # when that reverses it stops being a scrap and becomes a
            # tooth, and a row of teeth is fur.
            is_clump = rng.random() < RELIEF["clump_share"]
            if is_clump:
                w = int(rng.uniform(*RELIEF["clump_w"]) * s)
                drop = rng.uniform(*RELIEF["clump_drop"]) * s
            else:
                w = int(rng.uniform(*RELIEF["chip_w"]) * s)
                drop = rng.uniform(*RELIEF["chip_drop"]) * s
            drop *= 0.55 + 0.45 * zone_frag[cx]

            # A ragged lower boundary, but ragged ALONG the fragment: a
            # short correlated walk riding on an arch. Per-column noise
            # here is what produces a comb; the walk produces a torn flake.
            walk = np.cumsum(rng.normal(0.0, 1.0, w))
            # Smoothed: an unsmoothed walk lets one column run away from
            # its neighbours, and a lone 20px column is a spike, not a flake.
            k = max(3, w // 7)
            walk = np.convolve(walk, np.ones(k) / k, "same")
            walk -= walk.mean()
            walk /= abs(walk).max() + 1e-6
            arch = np.sin(np.pi * (np.arange(w) + 0.5) / w) ** 0.5
            profile = np.clip(arch * (1.0 + 0.5 * walk), 0.0, 1.35)

            # The ridge does not catch light along its whole length —
            # a flake is not polished. A second correlated walk picks the
            # patches that do, so the highlight is a couple of slivers
            # rather than a wash across the fragment.
            glint = np.cumsum(rng.normal(0.0, 1.0, w))
            glint -= glint.mean()
            glint = np.clip(glint / (abs(glint).max() + 1e-6), 0.0, 1.0)
            glint = np.clip((glint - 0.10) / 0.55, 0.0, 1.0) ** 0.5

            crown = rng.uniform(*RELIEF["crown"]) * lit_gain
            base = rng.uniform(*RELIEF["body"])
            lean = rng.uniform(-1.0, 1.0)   # which flank the light favours
            # Light belongs to the LARGE raised crowns. A chip is a few px
            # of hang: a highlight on one is a bright dot, and a scatter of
            # bright dots along the tear is the outline again, just
            # dotted. A clump has a ridge wide enough to show a crown, a
            # body falling away from it, and a shadow under it — which is
            # the whole of what makes a fragment read as a solid thing.
            #
            # And lit fragments CLUSTER: the slow field leaves whole
            # stretches dark, so the highlights come in patches with gaps
            # rather than spaced evenly along the edge.
            share = RELIEF["lit_share"] if is_clump else RELIEF["lit_share_chip"]
            lit = rng.random() < share * (0.15 + 1.9 * zone_lit[cx])
            # Where along the hang the fold-ridge sits. Never at the
            # attachment line: a crown at y=0 on every fragment is a
            # highlight strung along the contour, i.e. an outline.
            ridge = rng.uniform(0.22, 0.70)

            for i in range(w):
                xx = (cx + i) % w_px
                across = (i + 0.5) / w
                prof = float(profile[i])
                depth = drop * prof
                if depth < 0.7 * s:
                    continue
                # The fragment turns: one flank fuller light than the other.
                flank = 1.0 + RELIEF["lean"] * lean * (0.5 - across) * 2.0
                peak = ridge * depth
                for yy in range(int(depth) + 1):
                    # Body: dark, and darker toward the hanging tip, which
                    # is what puts the fragment in front of the paper.
                    # Falls away hard below the ridge: a tight lit sliver
                    # against a near-black body is what reads as modelled.
                    # A soft bright band over the same area reads as smudge.
                    below = max(0.0, (yy / depth) - ridge) / max(1e-6, 1.0 - ridge)
                    shade = base * (1.0 - 0.72 * below)
                    if lit:
                        near = (yy - peak) / max(1.1 * s, 0.17 * depth)
                        shade += (crown - base) * float(np.exp(-near * near)) * float(glint[i])
                    put(xx, ys[xx] + yy, float(np.clip(shade * flank, 3, 170)), 0.95)
                # The hollow behind it, inside the black.
                if rng.random() < 0.72:
                    for k in range(s):
                        put(xx, ys[xx] - rng.uniform(0.4, 2.4) * s + k, 0.0,
                            rng.uniform(0.45, 0.88) * prof)
                # Narrow contact shadow where it lies on the exposed paper.
                for k in range(1, 2 * s + 1):
                    put(xx, ys[xx] + depth + k, 3.0,
                        max(0.0, RELIEF["contact"] - 0.18 * (k / s)) * prof)

    # 4. FINE SCALE: short broken strands, concentrated where the edge is
    #    fibrous. Short and sparse — 1500 long ones read as fur.
    for _ in range(420):
        x0 = int(rng.integers(0, w_px))
        # Steeply gated, so the quiet stretches are genuinely clean. An
        # edge that sheds fibre evenly along its whole length is a
        # serration pattern; a real tear shreds in some places and parts
        # cleanly in others.
        if rng.random() > 0.04 + 0.96 * zone_fibre[x0] ** 1.7:
            continue
        length = max(1.0, rng.gamma(1.4, 1.15) * s)
        lean = rng.uniform(-0.55, 0.55)
        thick = (1 if rng.random() < 0.82 else 2) * s
        dark = rng.uniform(10, 38)
        for step in range(int(length)):
            xx = int(x0 + lean * step) % w_px
            fade = (1.0 - step / (length + 0.5)) ** 0.7
            for w in range(thick):
                put(xx, ys[xx] + 0.5 * s + step + w, dark,
                    min(0.80, rng.uniform(0.35, 0.80) * fade))

    # 5. The contact shadow the edge drops on the paper — irregular, never
    #    a band, and lighter where the stretch tore clean.
    for x in range(w_px):
        if rng.random() < 0.34 + 0.3 * zone_frag[x]:
            for k in range(int(rng.integers(1, 3)) * s):
                put(x, ys[x] + 0.5 * s + k, 10.0,
                    rng.uniform(0.08, 0.34) * (0.5 + 0.5 * zone_frag[x]))

    if edge == "bottom":
        rgba = rgba[::-1, :, :]

    out = np.zeros((h_px, w_px, 4), dtype=np.uint8)
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
