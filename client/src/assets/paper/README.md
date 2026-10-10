# Paper assets

Three replaceable layers, kept separate on purpose (implementation spec
§2.3, §6): the **mask** defines the shape, the **texture** defines the
material, and the **fringe** defines the depth. Each is reached through one
CSS custom property in `../../components/paper/torn-paper.css`, so any of
them can be swapped without touching `TornPaperSection.tsx`.

| File | Role | Status |
|---|---|---|
| `tear-a-{top,bottom}.svg` | torn silhouette, vector contour | **hand-authored**, retouchable |
| `tear-{b,c}-{top,bottom}.svg` | the other contours | authored once tear-a is approved |
| `paper-fibers.webp` | supplied paper artwork | source, untouched |
| `paper-fibers.prepared.webp` | the same, re-centred on mid-grey | derived, generated |
| `fringe-fibers.stub.png` | dark edge fibre | **PLACEHOLDER** |

## The one remaining placeholder

The paper surface is real artwork now. Only the fringe is still a stand-in:

- **`fringe-fibers`** — dark fibrous edge detail with transparency: short
  irregular strands, the odd lighter fibre where the torn interior catches
  light. Tiles horizontally.

**On `paper-fibers.prepared.webp`.** `soft-light` is neutral only at
mid-grey, and the supplied artwork means 156. Blended raw it lightens every
sheet and shifts the palette the ink contrast was measured from, so
`scripts/prepare_paper_texture.py` re-centres it on 128 and scales its
deviation. The supplied file stays here untouched as the input; re-run the
script after replacing it.

To swap: drop the file in and change the one `url(...)` in
`torn-paper.css`. Nothing else moves.

## The tear contours

**Hand-authored**, in `scripts/author_tears.py`: a table of points placed
one lobe at a time, not a sum of frequencies. Summing octaves gives a wave
however many you stack — periodic spacing, every crest like its neighbours
— which is why the earlier contour read as decorative rather than torn.

The table carries the macro shape: rounded lobes of varying width, genuine
undercuts where x steps backwards so the black overhangs, secondary tears
on the flanks, and long shallow runs between. A separate fibre pass adds
the 2-3px roughness the reference has along every edge.

Retouch either the table or the emitted path directly. Two contracts, both
asserted by the script:

- x spans exactly 0..800 and the first and last `y` are **equal**, or the
  tile shows a seam under `mask-repeat: repeat-x`
- `y` stays inside [16, 98], so the tear never bites past the strip

Tiled rather than stretched, so a tall section never elongates the
contour (§8).
