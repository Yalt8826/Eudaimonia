# Paper assets

Three replaceable layers, kept separate on purpose (implementation spec
§2.3, §6): the **mask** defines the shape, the **texture** defines the
material, and the **fringe** defines the depth. Each is reached through one
CSS custom property in `../../components/paper/torn-paper.css`, so any of
them can be swapped without touching `TornPaperSection.tsx`.

| File | Role | Status |
|---|---|---|
| `tear-{a,b,c}-{top,bottom}.svg` | torn silhouette, vector contour | generated, retouchable |
| `paper-fibers.stub.png` | paper surface material | **PLACEHOLDER** |
| `fringe-fibers.stub.png` | dark edge fibre | **PLACEHOLDER** |

## The two placeholders

The spec rules out procedural noise as a substitute for real paper fibre
(§1, §2.1), and these do not pretend to be it. They exist so the component
could be built and reviewed before the artwork lands. Replace with:

- **`paper-fibers`** — a tileable photograph or scan of handmade paper,
  roughly 1024², **greyscale and centred on mid-grey** so the section tint
  survives being multiplied through it. Fine fibre, matte, no strong
  gradients or vignette.
- **`fringe-fibers`** — dark fibrous edge detail with transparency: short
  irregular strands, the odd lighter fibre where the torn interior catches
  light. Tiles horizontally.

To swap: drop the file in and change the one `url(...)` in
`torn-paper.css`. Nothing else moves.

## The tear contours

`scripts/gen_tear_svg.py` writes them — seamless horizontally (every
octave is an integer-frequency sinusoid over the strip width), tiled with
`mask-repeat: repeat-x` so a tall section never stretches its tear out of
proportion (§8).

They are meant to be retouched. Open one in any vector editor and reshape
the path; the only contract is that the first and last points keep the same
`y`, or the tile will show a seam.
