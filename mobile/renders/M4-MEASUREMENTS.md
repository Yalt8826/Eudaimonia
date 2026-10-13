# M4 measurement — motion, 2026-10-14

Device: owner's A059, 1080×2392 @420dpi (411×911dp, scale 2.625), Expo Go
SDK 57, `react-native-reanimated` 4.5.1, `react-native-gesture-handler`
2.32.0. Gesture logs are `[m4]` lines from Metro (`logDev`, `__DEV__` only).

## Exit tests (PHASE-M §M4)

| test | result |
|---|---|
| gesture works on a physical device | **PASS** — all five paths below |
| reduce-motion drops travel, keeps the state change | **PASS** — measured both ways |
| no entrance animation on the wake screen | **PASS** — pinned by motion.test.ts; see caveat |
| motion conveys no data | **PASS** — motion.test.ts scans every source line |

## The gesture, on device

Anchor centre (411.4 − 12 − 35.2, 911.2 − 12 − 35.2) = 364,864dp.

| input | translation | resolved | landed |
|---|---|---|---|
| quick tap | 0,0 · travel 0.0 | `[captureTap]` | /capture |
| drag 135° | −91,−91 · travel 129.0 | `[act,fold]` | Plaza |
| drag 180° | −129,0 · travel 129.0 | `[act,fold]` | Inbox |
| drag 112.5° | −32,−78 · travel 84.5 | `[act,fold]` | Settings |
| drag 90° (up) | 0,−132 · travel 131.6 | `[act,fold]` | More → sheet |
| hold, release on nothing | 0,0 | `[fold]` | no navigation |

Travel, §8 band is 150–200ms: **open 169.4 / 170.7 / 176.5**, **fold
167.7 / 168.9**. Every sample inside the band.

Dragging TO a spoke's centre acts. Before the coordinate fix it took an
overshoot PAST the spoke, which is what the owner reported.

## Reduce-motion

Set via `animator_duration_scale`, `transition_animation_scale`,
`window_animation_scale` = 0 **and** `accessibility_display_animation_disabled`
= 1 — Reanimated did not report reduced motion until the accessibility
flag was set, so the three scales alone are not the signal. Restored to
1/1/1 and 0 afterwards.

Open logged `fan open: reduce-motion, travel dropped, ring arrived`, fold
likewise, and the release still produced `[act,fold]` and navigated. The
travel is dropped; the state change is not. Screenshot confirms the ring
is on screen, not skipped.

## Ring geometry

One radius, 8.8rem. Adjacent centres are a chord apart, 2·R·sin(11.25°):

| radius | chord | gap between 3rem bubbles |
|---|---|---|
| 8.2rem (old outer) | 51.2dp | 3.2dp — reads as touching |
| **8.8rem** | **54.9dp** | **6.9dp** |

The previous layout alternated 8.2/5.4rem, buying room by staggering
neighbours rather than spacing them; it read as a zigzag with the outer
spokes thrown out of the arc.

## The screen transition — honest result

`ScreenFade` is driven by `withTiming(1, { duration: 160 })` on opacity,
keyed by pathname, and its duration is pinned by two tests.

**It is not visible on the Plaza, and the recording says why.** At 60fps
the navigation shows mean luminance 11 → 108 in ONE frame, then 108 → 122
some frames later: two discrete levels, no ramp. The fade is running — it
simply finishes before the Plaza's first paint, which in Expo Go takes
longer than the 160ms window. What the recording captures is the content
arriving, already opaque.

It was `entering={FadeIn}` first. That version was worse and the same
recording caught it: Reanimated's LAYOUT animations are not honoured in
this configuration at all, so the fade never ran while a mock-based test
recorded `FadeIn.duration=160` and passed. A mock proves a value reaches
an API; it cannot prove the API does anything. `withTiming` is the
mechanism the rest of this client's motion already uses and measures.

**Re-verify in M5.** A dev build renders far faster than Expo Go, so the
160ms window may land before first paint rather than after. If it still
does not show, the transition is not earning its place and should be cut
rather than kept as decoration nobody sees.

## Caveat on the wake screen

`motion.test.ts` asserts the wake source carries no entrance construct and
that the root Stack presents with `animation: "none"`. The device
recording of a cold deep-link into /habits/wake was NOT captured —
`screenrecord` began failing (encoder err −38, then 12KB empty files)
after repeated use in this session. Treat the wake entrance as
test-pinned, not observed, and fold it into M5's cold-start test.

## Tooling note, cost it twice

**Metro's file watcher does not see changes on this NTFS/FUSE mount.**
Every edit needs Metro restarted (`--clear`) or the device silently runs
stale code. Three fixes in this session appeared to fail after they had
already landed.
