#!/usr/bin/env python3
"""Generate the torn-paper interface assets (docs/implementation/
"Implementation specification for the torn-paper interface" §2).

Outputs into client/src/assets/paper/:
  black-paper.webp    near-black fine-grain stock, tiles the plaza background
  paper-fibers.webp   neutral transparent fiber texture, tinted by --paper-color
  torn-section-a/b/c.svg  three distinct full-section alpha masks
  torn-fringe.svg     dark fibrous fringe along the top and bottom exposed
                      edges (transparent middle) — the material that makes
                      the tear physical

Seamless by construction: every noise octave is an integer-frequency sinusoid
over the tile width, so tiles meet exactly. Idempotent — fixed seeds.

Run: `python3 scripts/gen_paper_assets.py`
"""

from __future__ import annotations

import pathlib

import numpy as np
from PIL import Image, ImageDraw

SIZE = 1024
OUT = pathlib.Path(__file__).resolve().parent.parent / "client/src/assets/paper"

MASK_W, MASK_H = 1000, 360


def tileable_field(
    rng: np.random.Generator, size: int, octaves: list[tuple[int, float]]
) -> np.ndarray:
    """Integer-frequency plane waves, random directions — seamless, no grid."""
    x = np.arange(size)[None, :]
    y = np.arange(size)[:, None]
    acc = np.zeros((size, size))
    for cycles, amplitude in octaves:
        angle = rng.uniform(0.0, np.pi)
        fx = max(1, round(cycles * abs(np.cos(angle))))
        fy = max(1, round(cycles * abs(np.sin(angle))))
        phase = rng.uniform(0.0, 2.0 * np.pi)
        acc += amplitude * np.sin(
            x * fx * (2 * np.pi / size) + y * fy * (2 * np.pi / size) + phase
        )
    return acc


def wrap_draw(draw: ImageDraw.ImageDraw, x: int, fn):
    """Draw fn(draw, x) and its wrapped copies so tiles meet seamlessly."""
    for dx in (-SIZE, 0, SIZE):
        fn(draw, x + dx)


def gen_black_paper() -> None:
    """Near-black, fine grain, low contrast — paper, not leather or concrete."""
    rng = np.random.default_rng(11)
    field = tileable_field(
        rng, SIZE, [(3, 1.6), (7, 1.1), (13, 0.8), (29, 0.5)]
    )  # slight tonal variation, two scales
    base = np.zeros((SIZE, SIZE, 3), dtype=np.float64)
    base[..., 0] = 11 + field
    base[..., 1] = 14 + field
    base[..., 2] = 15 + field

    img = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8), "RGB")
    draw = ImageDraw.Draw(img)
    # fiber flecks: short 1px dashes, barely lighter or darker than the field
    for _ in range(2400):
        x, y = rng.integers(0, SIZE, 2)
        length = int(rng.integers(2, 7))
        dy = rng.integers(-1, 2)
        tone = float(rng.uniform(-5.0, 6.0))
        color = tuple(int(np.clip(c + tone, 0, 255)) for c in (13, 16, 17))

        def dash(d: ImageDraw.ImageDraw, xx: int) -> None:
            d.line(
                [(xx, y), (xx + length, y + dy)],
                fill=color,
                width=1,
            )

        wrap_draw(draw, x, dash)
    img.save(OUT / "black-paper.webp", quality=88, method=6)


def gen_paper_fibers() -> None:
    """Neutral transparent fiber texture — white and dark strands at low
    alpha, so --paper-color tints it without destroying the fibres."""
    rng = np.random.default_rng(23)
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    for _ in range(2600):
        x, y = rng.integers(0, SIZE, 2)
        length = int(rng.integers(5, 19))
        angle = rng.uniform(-0.35, 0.35)
        dx = int(round(length * np.cos(angle)))
        dy = int(round(length * np.sin(angle)))
        width = 1 if rng.random() < 0.82 else 2
        if rng.random() < 0.72:
            tone = rng.integers(235, 256)  # lit fibre
            alpha = int(rng.uniform(10, 26))
        else:
            tone = rng.integers(24, 70)  # shaded fibre
            alpha = int(rng.uniform(8, 20))
        color = (tone, tone, tone, alpha)

        def strand(d: ImageDraw.ImageDraw, xx: int) -> None:
            d.line([(xx, y), (xx + dx, y + dy)], fill=color, width=width)

        wrap_draw(draw, x, strand)
    img.save(OUT / "paper-fibers.webp", quality=92, method=6)


def boundary(rng: np.random.Generator, base: float, flip: bool) -> np.ndarray:
    """A tear line across the mask width: multi-octave wave + fibre-wisp
    clusters (short strands and bigger bites), wrapped so it tiles."""
    x = np.arange(MASK_W)
    y = np.full(MASK_W, float(base))
    for cycles, amplitude in [(2, 9.0), (3, 6.0), (5, 4.5), (9, 3.0), (13, 2.2), (34, 1.2)]:
        phase = rng.uniform(0.0, 2.0 * np.pi)
        y += amplitude * np.sin(2.0 * np.pi * cycles * x / MASK_W + phase)
    for _ in range(46):
        centre = rng.integers(0, MASK_W)
        half = int(max(2, rng.gamma(1.7, 6.0)))
        height = rng.uniform(3.0, 12.0)
        inward = rng.random() < 0.55
        offset = (x - centre + MASK_W // 2) % MASK_W - MASK_W // 2
        inside = np.abs(offset) <= half
        bump = np.zeros(MASK_W)
        bump[inside] = height * 0.5 * (1.0 + np.cos(np.pi * offset[inside] / half))
        y = y - bump if inward else y + bump
    return MASK_H - y if flip else y


def section_mask(seed: int, name: str) -> None:
    """Full-section alpha mask: opaque inside the paper, transparent outside.
    Displacement roughens the authored contour (spec §4.1); the fine fibre
    detail comes from the fringe layer, not this mask."""
    rng = np.random.default_rng(seed)
    top = boundary(rng, base=34.0, flip=False)
    bottom = boundary(rng, base=MASK_H - 30.0, flip=True)
    pts_top = [f"{x} {top[x % MASK_W]:.1f}" for x in range(0, MASK_W + 1, 10)]
    pts_bot = [f"{x} {bottom[x % MASK_W]:.1f}" for x in range(MASK_W, -1, -10)]
    d = (
        f"M 0 {top[0]:.1f} "
        + " ".join(f"L {p}" for p in pts_top)
        + " L 1000 "
        + " ".join(f"L {p}" for p in pts_bot)
        + " Z"
    )
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {MASK_W} {MASK_H}" preserveAspectRatio="none">
  <!-- Torn-section alpha mask ({name}) — authored contour, displaced roughness.
       Opaque inside the paper, transparent outside. Generated by
       scripts/gen_paper_assets.py; three variants, distinct tears. -->
  <defs>
    <filter id="edge-roughness" x="-5%" y="-5%" width="110%" height="110%">
      <feTurbulence type="fractalNoise" baseFrequency="0.035 0.12" numOctaves="2" seed="{seed}" result="noise"/>
      <feDisplacementMap in="SourceGraphic" in2="noise" scale="5" xChannelSelector="R" yChannelSelector="G"/>
    </filter>
  </defs>
  <path d="{d}" fill="#ffffff" filter="url(#edge-roughness)"/>
</svg>
'''
    (OUT / name).write_text(svg)


def fringe_svg() -> None:
    """Dark fibrous fringe along the exposed top and bottom edges: broken
    near-black strands, occasional lit fibres, and the dark torn underside of
    the sheet above. Transparent across the middle of the sheet."""
    rng = np.random.default_rng(77)
    top = boundary(rng, base=34.0, flip=False)
    bottom = boundary(rng, base=MASK_H - 30.0, flip=True)

    parts: list[str] = []
    # the sheet-above's dark torn underside, hanging into the band
    parts.append(
        f'<path d="M 0 {top[0]:.1f} '
        + " ".join(f"L {x} {top[x]:.1f}" for x in range(10, MASK_W, 10))
        + ' L 1000 0 L 0 0 Z" fill="#07090a" opacity="0.9"/>'
    )
    # fine dark strands hugging the top boundary, hanging down
    for x in range(0, MASK_W, 5):
        b = top[x % MASK_W]
        x1 = x + rng.integers(-2, 3)
        hang = rng.uniform(3.0, 11.0)
        parts.append(
            f'<line x1="{x1}" y1="{b - rng.uniform(1.0, 3.0):.1f}" '
            f'x2="{x1 + rng.integers(-2, 3)}" y2="{b + hang:.1f}" '
            f'stroke="#0b0d0e" stroke-width="{rng.uniform(0.8, 2.2):.1f}" '
            f'opacity="{rng.uniform(0.45, 0.95):.2f}"/>'
        )
    # lit fibre flecks where the core catches light
    for _ in range(90):
        x = rng.integers(0, MASK_W)
        b = top[x]
        parts.append(
            f'<line x1="{x}" y1="{b + rng.uniform(0.0, 3.0):.1f}" '
            f'x2="{x + rng.integers(-2, 4)}" y2="{b - rng.uniform(1.0, 5.0):.1f}" '
            f'stroke="#e8ede9" stroke-width="1" opacity="{rng.uniform(0.10, 0.24):.2f}"/>'
        )
    # the sheet-below's lit torn core rising into the band, then dark strands
    parts.append(
        f'<path d="M 0 {bottom[0]:.1f} '
        + " ".join(f"L {x} {bottom[x]:.1f}" for x in range(10, MASK_W, 10))
        + ' L 1000 360 L 0 360 Z" fill="#101214" opacity="0.55"/>'
    )
    for x in range(0, MASK_W, 5):
        b = bottom[x % MASK_W]
        x1 = x + rng.integers(-2, 3)
        rise = rng.uniform(3.0, 10.0)
        parts.append(
            f'<line x1="{x1}" y1="{b + rng.uniform(1.0, 3.0):.1f}" '
            f'x2="{x1 + rng.integers(-2, 3)}" y2="{b - rise:.1f}" '
            f'stroke="#141618" stroke-width="{rng.uniform(0.8, 2.0):.1f}" '
            f'opacity="{rng.uniform(0.4, 0.85):.2f}"/>'
        )
    for _ in range(70):
        x = rng.integers(0, MASK_W)
        b = bottom[x]
        parts.append(
            f'<line x1="{x}" y1="{b - rng.uniform(0.0, 3.0):.1f}" '
            f'x2="{x + rng.integers(-3, 3)}" y2="{b + rng.uniform(1.0, 5.0):.1f}" '
            f'stroke="#f1e9df" stroke-width="1" opacity="{rng.uniform(0.08, 0.2):.2f}"/>'
        )

    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {MASK_W} {MASK_H}" preserveAspectRatio="none">
  <!-- Torn fringe (spec §4.2): dark fibrous strands and the dark torn
       underside of the sheet above, along the exposed edges only. The
       contact shadow rides the CSS drop-shadow on .torn-section__fringe.
       Generated by scripts/gen_paper_assets.py. -->
  {"".join(parts)}
</svg>
'''
    (OUT / "torn-fringe.svg").write_text(svg)


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    gen_black_paper()
    gen_paper_fibers()
    section_mask(101, "torn-section-a.svg")
    section_mask(202, "torn-section-b.svg")
    section_mask(303, "torn-section-c.svg")
    fringe_svg()
    for f in sorted(OUT.iterdir()):
        print(f"{f.name:24s} {f.stat().st_size // 1024} KB")


if __name__ == "__main__":
    main()
