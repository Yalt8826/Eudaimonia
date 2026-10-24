# Plaza cold-start — measured 2026-10-24, A059 (owner's phone), adb from athena

Complaint: "the plaza takes so much time to render." Measured before
touching anything (the repo's rule), on the T2.1 build.

## Baseline (the fontsKey remount build)

- native `am start -W` TotalTime: 266 / 211 / 201 ms — never the problem
- logcat, cold start: the Plaza's Skia tree was built **THREE times** —
  surface-creation waves at **+0.8s / +1.1s / +1.5s** (18
  `onSurfaceTextureAvailable`), the big sheet re-laid-out
  1080x3846 -> 3959 -> 4178 across passes, each pass re-rasterizing five
  1080x700-4200 px textures. Cause: `_layout.tsx` keyed the Stack on
  font-readiness (`fontsKey`), and the two `useFonts` hooks resolved at
  different moments — two remounts after the first mount.
- a11y-poll to content: 3189 / 3606 / 3601 ms (poll granularity ~1 s;
  uiautomator dumps are O(seconds) on a Skia tree — too coarse to judge
  paint, fine to prove the complaint)

## Fix: fonts gate the first mount

`_layout.tsx` renders the matte skin (`colors["--bg"]`, 01 s1) until both
faces settle — `loaded || error`, so a font failure degrades to system
faces exactly like the old fallback key. The tree then mounts ONCE: the
first paint is the final paint. The `fontsKey` remount is gone.

## After (same device, same methods, plus on-device screencap bursts)

- surface waves collapse into one pass (all within +0.9 s of
  `Running "main"` at +0.55 s); no third wave, no size churn
- on-device `screencap` burst (truth, not polls):
  +0.68 s system splash | +1.1-1.5 s matte hold (the gate) |
  **+2.0-2.6 s first full render** (2.4 MB of textured Plaza) |
  +3.6 s settled
- warm start: effectively instant (first burst frame already rendered)
- regression check on the same build: wake deeplink -> one tap -> drains
  immediately (event id 14); the owner's own taps (ids 12-13) drained
  live — 14 events, all accounted for

## What was NOT done, on purpose

- per-sheet progressive mounting, single-canvas Plaza, ABI-split APK:
  real options if ~2 s is still too slow, but each trades design law
  (entrance effects), architecture (one surface vs five), or install
  size; none are free. `useImage` already shares the fibre/fringe decodes
  across sheets — no dedup win left there.

The boot hold is the matte skin itself: no spinner, no logo — the app's
own background, so the wait reads as the app waking, not as a loader.
