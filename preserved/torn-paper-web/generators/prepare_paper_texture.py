#!/usr/bin/env python3
"""Prepare the supplied paper texture for use as a soft-light fibre layer.

The source artwork (`paper-fibers.webp`) is the real thing and stays in the
repo untouched; this writes a derived file beside it. One correction is
needed and it is not cosmetic:

  SOFT-LIGHT IS NEUTRAL ONLY AT MID-GREY. The source has a mean luminance
  of 156, not 128, so blended as-is it lightens every sheet — shifting the
  measured tint and the ink contrast that was computed from it. Centring
  the texture on 128 keeps the palette exactly as measured and lets the
  fibre's deviation, which is the part that carries the material, show
  through unchanged.

Tiling needed no correction: the source's edge discontinuity (33.9) is
within a whisker of its own interior row-to-row variation (30.6), so the
join is no more visible than any other boundary in the fibre.

`AMPLITUDE` scales the deviation about mid-grey. 1.0 keeps the source's
own contrast; lower it if the fibre reads louder than the reference's
paper. It changes only how strongly the material shows, never the tint.

Run: `python3 scripts/prepare_paper_texture.py`
"""

from __future__ import annotations

import pathlib
import sys

import numpy as np
from PIL import Image

PAPER = pathlib.Path(__file__).resolve().parent.parent / "client/src/assets/paper"
SOURCE = PAPER / "paper-fibers.webp"
PREPARED = PAPER / "paper-fibers.prepared.webp"

MID_GREY = 128.0
AMPLITUDE = 0.62


def main() -> None:
    if not SOURCE.exists():
        sys.exit(f"missing {SOURCE} — drop the 1024x1024 greyscale texture there first")

    source = np.array(Image.open(SOURCE).convert("L")).astype(np.float64)
    deviation = source - source.mean()
    prepared = np.clip(MID_GREY + deviation * AMPLITUDE, 0, 255).astype(np.uint8)

    Image.fromarray(prepared, mode="L").convert("RGB").save(PREPARED, quality=92, method=6)

    print(f"source   mean {source.mean():6.1f}  std {source.std():5.1f}")
    print(f"prepared mean {prepared.mean():6.1f}  std {prepared.std():5.1f}  (mid-grey {MID_GREY:.0f})")
    print(f"wrote {PREPARED.name} ({PREPARED.stat().st_size // 1024}KB)")


if __name__ == "__main__":
    main()
