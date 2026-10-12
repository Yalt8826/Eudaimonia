#!/usr/bin/env python3
"""M2 acceptance harness — measures a stitched Plaza render against the M2
acceptance rows (docs/implementation/PHASE-M-STACK-MIGRATION.md §M2), sheet
by sheet, and against the preserved web reference renders at the same width.

Nothing here is eyeballed. The rim/relief/clearance windows anchor on the
KNOWN contour at the KNOWN tile phase (never on "the first paper pixel" —
see the preserved README for two metrics that anchored there and lied).

Rows measured per sheet (mint/tear-a, sky/tear-b, blush/tear-c,
butter/tear-a@260, lavender/tear-b@420):
  tint          median paper pixel vs its token, within 1/255 per channel
  no_rim        band-mean luminance 1-2 CSS px OUTSIDE the top contour,
                <10% of columns above 35 (the M0 convention, calibrated on
                the web reference; per-column max reads 11-14% even on the
                good render and is reported alongside)
  relief        informational, as in M0 (within 8px, mean lum > 60, patches)
  clearance     no glyph pixel within 6 CSS px of any fringe pixel
  geometry      located sheet top vs the app's own reported layout (mine)
                or vs the reference render (comparison rows)

Usage:
  python3 scripts/measure_plaza.py render.png --dpr 3 --json out.json \
      [--assets assets/tears] [--reference]

The reference renders (preserved/torn-paper-web/renders/plaza-*.png) are
DPR 1 full-page captures; pass --reference for them (locates sheets the
same way, so both sides of every comparison come from one algorithm).
"""

import argparse
import json
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from measure_sheet import (  # noqa: E402
  TEAR_H,
  TEAR_W,
  contour_at,
  dilate,
  erode,
  largest_component,
  parse_contour,
  wcag_contrast,
)


def load_css_layers(path: Path, dpr: int):
    """measure_sheet.load_css_layers with one relaxation: the CSS HEIGHT may
    be fractional. The stitched render ends at 3 x 711.33 px (the phone's
    viewport is 2134/3 tall), so H % dpr can be 1-2 rows; the trailing
    partial row is dropped. WIDTH stays strict (integer CSS width) — the
    repeat-x tile maths depends on it."""
    im = Image.open(path).convert("RGB")
    W, H = im.size
    assert W % dpr == 0, f"{path}: width {W} not divisible by dpr {dpr}"
    a = np.array(im, dtype=float)[: (H // dpr) * dpr]
    css_w, css_h = W // dpr, a.shape[0] // dpr
    blocks = a.reshape(css_h, dpr, css_w, dpr, 3)
    rgb_mean = blocks.mean(axis=(1, 3))
    lum_lin = 0.2126 * blocks[..., 0] + 0.7152 * blocks[..., 1] + 0.0722 * blocks[..., 2]
    lum_phys = 0.2126 * a[..., 0] + 0.7152 * a[..., 1] + 0.0722 * a[..., 2]
    return rgb_mean, lum_lin.max(axis=(1, 3)), lum_lin.mean(axis=(1, 3)), lum_phys

# The Plaza strip model (mobile/src/plaza/model.ts — kept in sync by the
# model test, which asserts this exact order).
SHEETS = [
    {"id": "plan", "variant": "mint", "tear": "a", "offset": 0},
    {"id": "waiting", "variant": "sky", "tear": "b", "offset": 0},
    {"id": "habits", "variant": "blush", "tear": "c", "offset": 0},
    {"id": "yesterday", "variant": "butter", "tear": "a", "offset": 260},
    {"id": "agents", "variant": "lavender", "tear": "b", "offset": 420},
]


def tokens_hex(tokens_path: Path) -> dict:
    """The sheet tints, read FROM tokens.ts — the harness must not carry a
    second copy of the palette."""
    src = tokens_path.read_text()
    out = {}
    for m in re.finditer(r'"(--sheet-[a-z]+)":\s*"(#[0-9A-Fa-f]{6})"', src):
        out[m.group(1)] = np.array(
            [int(m.group(2)[i : i + 2], 16) for i in (1, 3, 5)], dtype=float
        )
    expected = {f"--sheet-{s['variant']}" for s in SHEETS}
    missing = expected - set(out)
    if missing:
        raise SystemExit(f"tokens.ts missing sheet tokens: {missing}")
    return out


def check_tint_separation(tokens: dict, tol: float = 12.0) -> None:
    """No pixel may be within tol of two tokens: for every pair, some
    channel's token ranges must not overlap (|diff| > 2*tol there)."""
    names = sorted(tokens)
    for i, a in enumerate(names):
        for b in names[i + 1 :]:
            d = np.abs(tokens[a] - tokens[b]).max()
            if d <= 2 * tol:
                raise SystemExit(
                    f"{a} and {b} are {d:.0f}/255 apart — within 2x tol {tol}, "
                    f"locating would be ambiguous"
                )


def find_sheet_tops(rgb_mean, lum_mean, contours, phase_of, tokens, sheet_order):
    """Per-sheet top offset T (CSS px), by correlating the row profile of
    paper-bright columns against the predicted paper fraction below the
    contour — measure_sheet.find_sheet_top, generalised to phase and run
    sequentially. The correlation window is SHORT (~160 rows) and anchored
    just above the previous sheet's bottom edge: a 420-row window dilutes
    r to 0.71 where the M0-calibrated ~130-row window reads 0.994 on the
    same reference render. Returns {id: T}."""
    css_h, css_w = rgb_mean.shape[:2]
    bright = lum_mean > 100
    bright_frac = bright.mean(axis=1)
    tops = {}
    xs = np.arange(css_w) + 0.5
    prev_bottom = 120.0  # the first sheet's window starts under the header text
    prev_top = 0.0
    for sheet in sheet_order:
        c_top = contours[sheet["tear"]]["top"]
        phase = phase_of(sheet)
        # window starts AT the previous sheet's last bright row: the sheets
        # interlock, so rows above it still carry the previous sheet's
        # paper while this sheet's pred is 0 there — that tail poisoned the
        # correlation (0.77) on the reference. This sheet's contour ramp
        # (T+16..T+98) sits fully below prev_bottom (top = prev_bottom-72
        # plus the contour's own depth), so nothing is lost.
        y0 = max(0, int(prev_bottom))
        rows = np.arange(y0, min(y0 + 160, css_h))
        obs = bright[y0 : y0 + len(rows)].mean(axis=1)
        # the sheets interlock: the next box's top sits ~72px ABOVE the
        # previous sheet's paper's last bright row, so the search runs from
        # the previous TOP plus the smallest sheet pitch, never from the
        # previous bottom
        best_t, best_r = 0.0, -2
        search_lo = prev_top + 150 if sheet is not sheet_order[0] else 0.0
        for T in np.arange(search_lo, min(prev_top + 800, css_h - TEAR_H - 60), 0.5):
            cvals = T + contour_at(c_top, (xs - phase) % TEAR_W)
            pred = np.array([(cvals <= y).mean() for y in rows])
            if pred.std() == 0 or obs.std() == 0:
                continue
            r = np.corrcoef(obs, pred)[0, 1]
            if r > best_r:
                best_r, best_t = r, float(T)
        if best_r < 0.9:
            raise SystemExit(
                f"[locate] {sheet['id']}: row-profile match too weak (r={best_r:.3f}) — wrong image or phase?"
            )
        # edge-lock, as in M0: pull T up to where the contour row itself is
        # paper-bright in ~1/3 of columns (strands + cast darken the first
        # rows and bias the correlation peak a few px late)
        lock_t = best_t
        for Tc in np.arange(best_t - 8, best_t + 0.5, 0.25):
            edge = np.floor(Tc + contour_at(c_top, (xs - phase) % TEAR_W)).astype(int)
            ok = sum(
                1 for x in range(css_w)
                if edge[x] < css_h and lum_mean[edge[x], x] > 100
            )
            if ok >= 0.30 * css_w:
                lock_t = float(Tc)
                break
        tops[sheet["id"]] = lock_t
        print(f"[locate] {sheet['id']}: T={lock_t}px (profile {best_t:.1f}, r={best_r:.3f})")
        # this sheet's bottom edge: last bright row before the skin band
        bottom = lock_t + 100
        for y in range(int(lock_t) + 50, css_h):
            if bright_frac[y] > 0.5:
                bottom = float(y)
            elif y > bottom + 40:
                break
        prev_bottom = bottom
        prev_top = lock_t
    return tops


def fringe_footprint(assets: Path, tear: str, which: str, css_w: int, css_h: int,
                     origin_y: float, phase: int) -> np.ndarray:
    """alpha>0 footprint of the fringe tile at (phase, origin_y), 800x112
    CSS, repeat-x — measure_sheet.fringe_footprint with the tile phase."""
    png = np.array(Image.open(assets / f"fringe-{tear}-{which}.png").convert("RGBA"), dtype=float)
    alpha = png[:, :, 3] / 255.0
    css_a = alpha.reshape(TEAR_H, 2, TEAR_W, 2).mean(axis=(1, 3))  # 2x -> 1x
    grid = np.zeros((css_h, css_w), dtype=bool)
    tiles = int(np.ceil(css_w / TEAR_W)) + 1
    tiled = np.tile(css_a, (1, tiles))[:, : css_w + TEAR_W]
    # roll by phase: pixel at screen x reads tile coordinate (x - phase)
    tiled = np.roll(tiled, phase, axis=1)[:, :css_w]
    y0 = int(np.floor(origin_y))
    for y in range(TEAR_H):
        gy = y0 + y
        if 0 <= gy < css_h:
            grid[gy] |= tiled[y] > 0.02
    return grid


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("render", type=Path)
    ap.add_argument("--dpr", type=float, default=1)
    ap.add_argument("--reference", action="store_true")
    ap.add_argument("--assets", type=Path, default=Path("assets/tears"))
    ap.add_argument("--expect-geom", type=Path, default=None,
                    help="json {title: {y,h,w}} from the app's own onLayout report")
    ap.add_argument("--json", type=Path, default=None)
    args = ap.parse_args()

    rgb_mean, lum_max, lum_mean, lum_phys = load_css_layers(args.render, int(args.dpr))
    css_h, css_w = rgb_mean.shape[:2]
    tokens = tokens_hex(Path(__file__).resolve().parent.parent / "src" / "theme" / "tokens.ts")
    check_tint_separation(tokens)

    contours = {
        t: {edge: parse_contour(args.assets / f"tear-{t}-{edge}.svg") for edge in ("top", "bottom")}
        for t in ("a", "b", "c")
    }
    phase_of = lambda s: int(s["offset"] % TEAR_W)

    tops = find_sheet_tops(rgb_mean, lum_mean, contours, phase_of, tokens, SHEETS)

    results = {"render": str(args.render), "dpr": args.dpr, "reference": args.reference,
               "css_size": [css_w, css_h], "sheets": {}}

    for i, sheet in enumerate(SHEETS):
        T = tops[sheet["id"]]
        phase = phase_of(sheet)
        c_top = contours[sheet["tear"]]["top"]
        c_bot = contours[sheet["tear"]]["bottom"]
        xs = np.arange(css_w) + 0.5
        top_edge = T + contour_at(c_top, (xs - phase) % TEAR_W)

        # the sheet's box bottom: the NEXT sheet's top minus its ride-up
        # (plazaSheetOverlap -72 → box bottom = next top + 72), or — for the
        # last sheet — the furthest row still showing this sheet's tint
        if i + 1 < len(SHEETS):
            box_bottom = tops[SHEETS[i + 1]["id"]] + 72
        else:
            token = tokens[f"--sheet-{sheet['variant']}"]
            ys = np.where((np.abs(rgb_mean - token).max(axis=2) < 12).any(axis=1))[0]
            box_bottom = float(ys.max()) + 1 if len(ys) else css_h
        bot_edge = box_bottom - TEAR_H + contour_at(c_bot, (xs - phase) % TEAR_W)

        token = tokens[f"--sheet-{sheet['variant']}"]
        near = np.abs(rgb_mean - token).max(axis=2) < 12
        box = np.zeros_like(near)
        box[int(T) : int(box_bottom), :] = True
        paper = near & box
        paper = largest_component(paper)

        fr_top = fringe_footprint(args.assets, sheet["tear"], "top", css_w, css_h, T, phase)
        fr_bot = fringe_footprint(args.assets, sheet["tear"], "bottom", css_w, css_h,
                                  box_bottom - TEAR_H, phase)
        fringe = fr_top | fr_bot

        cast_zone = np.zeros_like(paper)
        cast_zone[int(T) : int(T + 30), :] = True
        cast_zone[int(box_bottom - 30) :, :] = True
        ink = (lum_mean < 75) & dilate(paper, 3) & ~dilate(fringe, 4)
        interior = erode(paper, 8) & ~dilate(fringe, 2) & ~cast_zone & ~dilate(ink, 3)

        row = {}

        # ---- tint: median interior vs token, within 1/255 per channel ----
        if interior.sum() < 500:
            # the eroded interior can fall under the sampling floor on
            # text-heavy sheets (yesterday@430: heading + two wrapped lines
            # + OPEN leave ~400px); fall back to the un-eroded paper minus
            # cast/fringe/ink rather than reporting nothing
            interior = paper & ~cast_zone & ~dilate(fringe, 2) & ~dilate(ink, 3)
        if interior.sum() < 200:
            row["tint"] = {"pass": None, "note": f"interior too small ({interior.sum()}px)"}
        else:
            med = np.median(rgb_mean[interior], axis=0)
            delta = med - token
            row["tint"] = {
                "median_rgb": [round(float(v), 2) for v in med],
                "token_rgb": [float(v) for v in token],
                "delta_vs_token": [round(float(v), 2) for v in delta],
                "max_abs_delta": round(float(np.abs(delta).max()), 2),
                "required": "<= 1/255 per channel",
                "pass": bool(np.all(np.abs(delta) <= 1.0)),
            }

        # ---- no rim: band-mean 1-2px OUTSIDE the contour (skin side) ----
        def rim(edge_y, skin_above):
            fail, n, fail_max = 0, 0, 0
            for x in range(css_w):
                yc = edge_y[x]
                if yc < 12 or yc > css_h - 12:
                    continue
                r0 = int(np.floor(yc - 2)) if skin_above else int(np.floor(yc + 1))
                y0, y1 = max(0, r0), min(css_h, r0 + 2)
                if y1 <= y0:
                    continue
                n += 1
                if float(lum_mean[y0:y1, x].mean()) > 35:
                    fail += 1
                if float(lum_max[y0:y1, x].mean()) > 35:
                    fail_max += 1
            return 100.0 * fail / max(n, 1), 100.0 * fail_max / max(n, 1), n

        pct, pct_max, n = rim(top_edge, skin_above=True)
        # bottom rim, only over columns whose 2px window is not buried by
        # the next sheet's skin (the reference has the same occlusion)
        if i + 1 < len(SHEETS):
            exposed = bot_edge + 2 < tops[SHEETS[i + 1]["id"]] - 0.5
        else:
            exposed = np.ones(css_w, dtype=bool)
        if exposed.sum() > 30:
            fail_b, n_b = 0, 0
            for x in range(css_w):
                if not exposed[x]:
                    continue
                yc = bot_edge[x]
                if yc < 12 or yc > css_h - 12:
                    continue
                r0 = int(np.floor(yc + 1))
                y0, y1 = max(0, r0), min(css_h, r0 + 2)
                if y1 <= y0:
                    continue
                n_b += 1
                if float(lum_mean[y0:y1, x].mean()) > 35:
                    fail_b += 1
            row["no_rim"] = {
                "top_pct_above_35_band_mean": round(pct, 1),
                "top_pct_above_35_strict_max": round(pct_max, 1),
                "bottom_pct_above_35_band_mean": round(100.0 * fail_b / max(n_b, 1), 1),
                "bottom_exposed_columns": int(n_b),
                "threshold_pct": 10,
                "pass": bool(pct < 10 and (n_b == 0 or 100.0 * fail_b / n_b < 10)),
            }
        else:
            row["no_rim"] = {
                "top_pct_above_35_band_mean": round(pct, 1),
                "top_pct_above_35_strict_max": round(pct_max, 1),
                "bottom": "fully occluded by the next sheet's skin — skipped",
                "threshold_pct": 10,
                "pass": bool(pct < 10),
            }

        # ---- text clearance: no glyph within 6 CSS px of fringe ----
        reached = fringe.copy()
        ink_alive = ink & ~fringe
        mind = None
        d = 0
        while d <= 30:
            if (reached & ink_alive).any():
                mind = d
                break
            reached = dilate(reached, 1)
            d += 1
        row["text_clearance"] = {
            "min_css_px_ink_to_fringe": mind,
            "required": "> 6",
            "pass": bool(mind is not None and mind > 6),
        }

        # ---- ink contrast (the M0 row, kept honest per sheet) ----
        if ink.sum() >= 50 and interior.sum() > 0:
            bg = interior & (lum_mean > 130)
            if bg.sum() > 0:
                ratio = wcag_contrast(
                    np.median(rgb_mean[ink], axis=0), np.median(rgb_mean[bg], axis=0)
                )
                row["ink_contrast"] = {"ratio": round(float(ratio), 2), "floor": 4.5,
                                       "pass": bool(ratio >= 4.5)}

        # ---- geometry: located box ----
        row["geometry"] = {"located_top_css": round(T, 1), "located_box_bottom_css": round(box_bottom, 1)}

        results["sheets"][sheet["id"]] = row

    # ---- app-reported layout cross-check ----
    # the located T IS the sheet box's top (the predicted contour is T +
    # c(x-phase)), so it should land on the app's own reported box top
    if args.expect_geom:
        reported = json.loads(Path(args.expect_geom).read_text())
        cc = {}
        for sheet in SHEETS:
            title = {"plan": "Today's Plan", "waiting": "Waiting On", "habits": "Habits",
                     "yesterday": "Yesterday", "agents": "Agents"}[sheet["id"]]
            if title in reported:
                cc[title] = {
                    "located_top": results["sheets"][sheet["id"]]["geometry"]["located_top_css"],
                    "reported_box_top": round(reported[title]["y"], 1),
                    "reported_h": round(reported[title]["h"], 1),
                }
        results["geometry_crosscheck"] = cc

    npass = 0
    nrows = 0
    for sid, row in results["sheets"].items():
        for k in ("tint", "no_rim", "text_clearance", "ink_contrast"):
            if k in row and row[k].get("pass") is not None:
                nrows += 1
                npass += 1 if row[k]["pass"] else 0
    results["rows_passing"] = f"{npass}/{nrows}"

    print(f"\n=== M2 acceptance — {args.render} @ {css_w}x{css_h} CSS px "
          f"(dpr {args.dpr}{' reference' if args.reference else ''}) ===\n")
    print(json.dumps(results, indent=2))
    print(f"\nrows passing: {npass}/{nrows}")
    if args.json:
        args.json.write_text(json.dumps(results, indent=2))
    return 0


if __name__ == "__main__":
    sys.exit(main())
