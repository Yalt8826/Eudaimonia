# Agent prompts — one per migration phase

Ready-to-paste prompts for `PHASE-M-STACK-MIGRATION.md`. **One phase per
session.** After each, verify the evidence before handing over the next.

| phase | status |
|---|---|
| M0 Skia spike | ✅ done — `a74267a`, GO |
| M1 shell + tokens | ✅ done — `11e964a` |
| M2 the Plaza | ready |
| M3 data + offline | ready |
| M4 motion | **blocked** until the 01 §6 motion amendment is ratified |
| M5 the APK | ready |
| M6 interactive widget | ready |
| M7 push | **blocked** until the notifications policy is written (plan §7) |
| M8 cutover | ready |

Every prompt is self-contained on purpose — the repetition is so you can
paste one without assembling it. Section A is identical in all of them;
section B is what differs.

---

## The standing rules (section A — identical everywhere)

```
## Hard rules — breaking any of these fails the task

1. Never edit anything under app/ — that is the server, untouched by this
   migration. If the port appears to need a server change, that is a sign
   the port is wrong. Stop and say so.
2. Never edit anything under client/ — the web app must stay green and
   deployable until M8. It is your reference.
3. Never delete anything under preserved/
4. Never run or modify preserved/torn-paper-web/generators/author_tears.py
   The tear contours in it are hand-drawn point tables. Use the committed
   SVG/PNG assets as-is.
5. Colour comes from mobile/src/theme/tokens.ts. Never write a hex literal
   in a component — scripts/lint_greps.sh fails the build on it.
6. Never add a glow, stroke, outline, drop-shadow or rim along a tear
   contour. Light placed relative to the contour FOLLOWS the contour,
   which is an outline however subtle. This shipped three times on the
   web before it was understood.
7. Port the LAWS, not just the code. Every invariant in
   docs/plan/v1/02-architecture.md §6 applies to the new client.
8. A value that a comment asserts gets a test. Two tokens have silently
   contradicted their own comments in this project; each cost multiple
   rounds of debugging.

## Verification — this is most of the job

Measure; do not eyeball. Print actual numbers, never the word "pass".

Two rules, both learned the hard way here:
- If a metric reads the same before and after a change you made, the
  METRIC is broken. Prove each one fails on a deliberately wrong input
  before you trust it passing.
- Never loosen a threshold to make a check pass. If a threshold cannot be
  met, that is the result — report it. In M0 two thresholds turned out to
  be wrong, and they were found precisely because the implementer
  reported the mismatch instead of adjusting the number.

## Stopping

Stop and report after 3 failed attempts at the same problem: what you
tried, what you observed, what you think is wrong. Do not thrash.

When done: run the mobile tests, `npx tsc --noEmit`, and
`sh scripts/lint_greps.sh all`. Confirm the web client is still green
(`cd client && pnpm vitest run`). Commit with a message stating what you
MEASURED, not what you intended.

DO NOT START THE NEXT PHASE. Not even if this one passes cleanly and the
next looks small. Stop at the end of this phase and report. Beginning the
next phase uninstructed is a failed task regardless of the code.
```

---

## M2 — the Plaza

```
You are implementing phase M2 of the Eudaimonia stack migration.
Repo: /mnt/storage/Study/Eudaimonia   Branch: git checkout -b M2-plaza from main

Read first: docs/implementation/PHASE-M-STACK-MIGRATION.md (M2 + the
ground rules at the end) · docs/implementation/mint-sheet-skia-brief.md
(the surface rules still hold) · preserved/torn-paper-web/README.md

## Build

The full Plaza: five sheets, three contours, the header, the nav cluster
as STATIC bubbles. No animation — motion is M4.

- Sheets, in order: mint/tear-a · sky/tear-b · blush/tear-c ·
  butter/tear-a@offset 260 · lavender/tear-b@offset 420. Three contours
  cover five sheets, so two repeat; the offset is what stops them showing
  the same lobes in the same places.
- Per-tear padding, from assets/tears/tear-metrics.json — NOT one value
  for all three. tear-a 100/91, tear-b 92/99, tear-c 97/96 (px, top/bottom).
- Header: long date ("Monday, 12 October"), a time-of-day greeting with
  the owner's name, and one cycling daily line. Port client/src/routes/
  greeting.ts unchanged — it is pure logic and already tested. The
  greeting runs a teal→plum gradient clipped to the text.
- The hue-law accent (a short rule under the heading) appears on TWO
  sheets only: mint and lavender. An accent on every sheet signals
  nothing.
- Nav cluster: six static glass bubbles, bottom-right, capture in the
  corner. Bubbles carry --bubble-veil under the glass fill or their icons
  are illegible over paper (white-on-glass measures 1.22 on butter).

## Tests — all measured, with numbers

- renders at 320 and 430 px match preserved/torn-paper-web/renders/
  plaza-{320,430}px.png
- all five tints within 1/255 per channel of their tokens
- no glyph pixel within 6 CSS px of any fringe pixel, on any sheet,
  at both widths
- no two ADJACENT sheets share a contour; no two sheets share
  contour AND offset
- the rim check from the Skia brief still passes on every sheet, not
  just mint
```

```
## Hard rules — breaking any of these fails the task

1. Never edit anything under app/ — that is the server, untouched by this
   migration. If the port appears to need a server change, that is a sign
   the port is wrong. Stop and say so.
2. Never edit anything under client/ — the web app must stay green and
   deployable until M8. It is your reference.
3. Never delete anything under preserved/
4. Never run or modify preserved/torn-paper-web/generators/author_tears.py
   The tear contours in it are hand-drawn point tables. Use the committed
   SVG/PNG assets as-is.
5. Colour comes from mobile/src/theme/tokens.ts. Never write a hex literal
   in a component — scripts/lint_greps.sh fails the build on it.
6. Never add a glow, stroke, outline, drop-shadow or rim along a tear
   contour. Light placed relative to the contour FOLLOWS the contour,
   which is an outline however subtle. This shipped three times on the
   web before it was understood.
7. Port the LAWS, not just the code. Every invariant in
   docs/plan/v1/02-architecture.md §6 applies to the new client.
8. A value that a comment asserts gets a test. Two tokens have silently
   contradicted their own comments in this project; each cost multiple
   rounds of debugging.

## Verification — this is most of the job

Measure; do not eyeball. Print actual numbers, never the word "pass".

Two rules, both learned the hard way here:
- If a metric reads the same before and after a change you made, the
  METRIC is broken. Prove each one fails on a deliberately wrong input
  before you trust it passing.
- Never loosen a threshold to make a check pass. If a threshold cannot be
  met, that is the result — report it. In M0 two thresholds turned out to
  be wrong, and they were found precisely because the implementer
  reported the mismatch instead of adjusting the number.

## Stopping

Stop and report after 3 failed attempts at the same problem: what you
tried, what you observed, what you think is wrong. Do not thrash.

When done: run the mobile tests, `npx tsc --noEmit`, and
`sh scripts/lint_greps.sh all`. Confirm the web client is still green
(`cd client && pnpm vitest run`). Commit with a message stating what you
MEASURED, not what you intended.

DO NOT START THE NEXT PHASE. Not even if this one passes cleanly and the
next looks small. Stop at the end of this phase and report. Beginning the
next phase uninstructed is a failed task regardless of the code.
```

---

## M3 — data and the offline contract

```
You are implementing phase M3 of the Eudaimonia stack migration.
Repo: /mnt/storage/Study/Eudaimonia   Branch: git checkout -b M3-data from main

Read first: docs/implementation/PHASE-M-STACK-MIGRATION.md (M3 + ground
rules) · docs/plan/v1/02-architecture.md §2 and §6 ·
client/src/sw/queue.ts and client/src/sw/queue.test.ts (the semantics you
are porting)

## Build

API client, offline write queue on expo-sqlite, the wake round-trip.

THE QUEUE'S SEMANTICS ARE NOT UP FOR REDESIGN. The idempotency guard,
dedup and ordering carry over exactly from client/src/sw/queue.ts. Only
the STORAGE changes — service worker + IndexedDB becomes expo-sqlite.
Port its tests too; they encode the contract.

The spine is append-only and the phone is a single writer THROUGH the
server. The app never writes a local source of truth and reconciles
later. If a design seems to need that, stop and say so.

The data plane is tailnet-only: /api/* is unreachable off-tailnet by
design. Unreachable is a normal state, not an error state — it must
queue, not fail loudly.

## Tests — the P2 exit test, unchanged

- airplane mode → wake tap → force-stop the app → reopen → EXACTLY ONE
  event, with the correct original `ts` (not the replay time)
- the same tap replayed twice produces one event, not two
- queue survives process death (that is what force-stop proves)
- every ported queue test from the web suite passes
```

```
## Hard rules — breaking any of these fails the task

1. Never edit anything under app/ — that is the server, untouched by this
   migration. If the port appears to need a server change, that is a sign
   the port is wrong. Stop and say so.
2. Never edit anything under client/ — the web app must stay green and
   deployable until M8. It is your reference.
3. Never delete anything under preserved/
4. Never run or modify preserved/torn-paper-web/generators/author_tears.py
   The tear contours in it are hand-drawn point tables. Use the committed
   SVG/PNG assets as-is.
5. Colour comes from mobile/src/theme/tokens.ts. Never write a hex literal
   in a component — scripts/lint_greps.sh fails the build on it.
6. Never add a glow, stroke, outline, drop-shadow or rim along a tear
   contour. Light placed relative to the contour FOLLOWS the contour,
   which is an outline however subtle. This shipped three times on the
   web before it was understood.
7. Port the LAWS, not just the code. Every invariant in
   docs/plan/v1/02-architecture.md §6 applies to the new client.
8. A value that a comment asserts gets a test. Two tokens have silently
   contradicted their own comments in this project; each cost multiple
   rounds of debugging.

## Verification — this is most of the job

Measure; do not eyeball. Print actual numbers, never the word "pass".

Two rules, both learned the hard way here:
- If a metric reads the same before and after a change you made, the
  METRIC is broken. Prove each one fails on a deliberately wrong input
  before you trust it passing.
- Never loosen a threshold to make a check pass. If a threshold cannot be
  met, that is the result — report it. In M0 two thresholds turned out to
  be wrong, and they were found precisely because the implementer
  reported the mismatch instead of adjusting the number.

## Stopping

Stop and report after 3 failed attempts at the same problem: what you
tried, what you observed, what you think is wrong. Do not thrash.

When done: run the mobile tests, `npx tsc --noEmit`, and
`sh scripts/lint_greps.sh all`. Confirm the web client is still green
(`cd client && pnpm vitest run`). Commit with a message stating what you
MEASURED, not what you intended.

DO NOT START THE NEXT PHASE. Not even if this one passes cleanly and the
next looks small. Stop at the end of this phase and report. Beginning the
next phase uninstructed is a failed task regardless of the code.
```

---

## M4 — motion

```
You are implementing phase M4 of the Eudaimonia stack migration.
Repo: /mnt/storage/Study/Eudaimonia   Branch: git checkout -b M4-motion from main

STOP IF NOT RATIFIED: this phase requires the motion amendment to
docs/plan/v1/01-design-system.md §6 to be ratified first (it is drafted
in docs/plan/v1/10-stack-migration.md §6). Until then 01 says L0 is
"still static, always" and its gate 4 is a literal string match that
trips on merely NAMING an animation construct. Check the amendment has
landed in 01 itself. If it has not, stop and report — do not proceed.

Read first: docs/implementation/PHASE-M-STACK-MIGRATION.md (M4 + ground
rules) · docs/plan/v1/01-design-system.md §6 as amended ·
`git show c0740e8` (why the web radial menu was parked)

## Build

The nav cluster as a real radial gesture, plus screen transitions.

The geometry is already worked out — reuse it:
- six bubbles, all 3rem; capture anchors the bottom-right corner
- five spokes on TWO alternating radii: outer 8.2rem, inner 5.4rem, at
  angles 90 / 112.5 / 135 / 157.5 / 180 degrees (90 = straight up).
  Alternating is not decorative: three on one arc and two on the other
  puts the last pair 2.1rem apart and they collide.
- order from the top around to the left: More, Settings, Plaza, Week, Inbox
- press-and-HOLD ~150ms to fan out, or a drag past ~10px opens it sooner;
  a quick tap stays a plain tap through to /capture
- selection is BY ANGLE, not by hit-testing circles: past a small dead
  zone each spoke owns the wedge nearest its angle, out to infinity
- release on a spoke acts; release on nothing folds it back

Why the web attempt was parked: an <a href> handle makes Blink start a
native HTML5 link drag, firing dragstart then pointercancel mid-gesture.
react-native-gesture-handler has no equivalent problem. If you hit
anything that smells like it, you are fighting the wrong layer.

## Tests

- the gesture works on a PHYSICAL device, not only an emulator
- reduce-motion drops the travel but keeps the state change — the ring
  must still visibly arrive
- NO entrance animation on the wake screen; 01 §6 survives the amendment
- motion conveys no data: liveness, staleness and state stay colour and
  text, never speed, bounce or direction
- state changes stay in the 150-200ms band
```

```
## Hard rules — breaking any of these fails the task

1. Never edit anything under app/ — that is the server, untouched by this
   migration. If the port appears to need a server change, that is a sign
   the port is wrong. Stop and say so.
2. Never edit anything under client/ — the web app must stay green and
   deployable until M8. It is your reference.
3. Never delete anything under preserved/
4. Never run or modify preserved/torn-paper-web/generators/author_tears.py
   The tear contours in it are hand-drawn point tables. Use the committed
   SVG/PNG assets as-is.
5. Colour comes from mobile/src/theme/tokens.ts. Never write a hex literal
   in a component — scripts/lint_greps.sh fails the build on it.
6. Never add a glow, stroke, outline, drop-shadow or rim along a tear
   contour. Light placed relative to the contour FOLLOWS the contour,
   which is an outline however subtle. This shipped three times on the
   web before it was understood.
7. Port the LAWS, not just the code. Every invariant in
   docs/plan/v1/02-architecture.md §6 applies to the new client.
8. A value that a comment asserts gets a test. Two tokens have silently
   contradicted their own comments in this project; each cost multiple
   rounds of debugging.

## Verification — this is most of the job

Measure; do not eyeball. Print actual numbers, never the word "pass".

Two rules, both learned the hard way here:
- If a metric reads the same before and after a change you made, the
  METRIC is broken. Prove each one fails on a deliberately wrong input
  before you trust it passing.
- Never loosen a threshold to make a check pass. If a threshold cannot be
  met, that is the result — report it. In M0 two thresholds turned out to
  be wrong, and they were found precisely because the implementer
  reported the mismatch instead of adjusting the number.

## Stopping

Stop and report after 3 failed attempts at the same problem: what you
tried, what you observed, what you think is wrong. Do not thrash.

When done: run the mobile tests, `npx tsc --noEmit`, and
`sh scripts/lint_greps.sh all`. Confirm the web client is still green
(`cd client && pnpm vitest run`). Commit with a message stating what you
MEASURED, not what you intended.

DO NOT START THE NEXT PHASE. Not even if this one passes cleanly and the
next looks small. Stop at the end of this phase and report. Beginning the
next phase uninstructed is a failed task regardless of the code.
```

---

## M5 — the APK

```
You are implementing phase M5 of the Eudaimonia stack migration.
Repo: /mnt/storage/Study/Eudaimonia   Branch: git checkout -b M5-apk from main

Read first: docs/implementation/PHASE-M-STACK-MIGRATION.md (M5 + ground
rules) · docs/implementation/PHASE-P6-TWA-HARDENING.md — its APK
mechanism is superseded, but the public origin, Digital Asset Links and
the wake-surface invariant it specifies all still stand · AGENTS.md in
mobile/ (fetch the versioned Expo docs; do not answer from memory)

## Build

EAS build profile, a dev client, a signed APK installable on device.
Register the deep link scheme `web+eudaimonia` → the wake route.

The public origin is already live (eudaimonia.yalt8826.com, Cloudflare
Tunnel → olympus static plane) and serves /.well-known/assetlinks.json.
Per 02 §6 the public plane serves shell/manifest/assetlinks only; /api/*
stays tailnet-only. Do not change that split.

## Tests

- the APK installs on a physical device
- cold start to the Plaza ≤ 2s, measured, stated
- `web+eudaimonia://wake` lands on the wake route
- THE WAKE SURFACE NEVER SHOWS BROWSER CHROME. A degraded install showing
  a URL bar on the wake screen is a build-blocking defect, not cosmetics
  (02 §6 invariant, carried over from the TWA plan)
- off-tailnet: the app opens and the wake tap QUEUES rather than failing
```

```
## Hard rules — breaking any of these fails the task

1. Never edit anything under app/ — that is the server, untouched by this
   migration. If the port appears to need a server change, that is a sign
   the port is wrong. Stop and say so.
2. Never edit anything under client/ — the web app must stay green and
   deployable until M8. It is your reference.
3. Never delete anything under preserved/
4. Never run or modify preserved/torn-paper-web/generators/author_tears.py
   The tear contours in it are hand-drawn point tables. Use the committed
   SVG/PNG assets as-is.
5. Colour comes from mobile/src/theme/tokens.ts. Never write a hex literal
   in a component — scripts/lint_greps.sh fails the build on it.
6. Never add a glow, stroke, outline, drop-shadow or rim along a tear
   contour. Light placed relative to the contour FOLLOWS the contour,
   which is an outline however subtle. This shipped three times on the
   web before it was understood.
7. Port the LAWS, not just the code. Every invariant in
   docs/plan/v1/02-architecture.md §6 applies to the new client.
8. A value that a comment asserts gets a test. Two tokens have silently
   contradicted their own comments in this project; each cost multiple
   rounds of debugging.

## Verification — this is most of the job

Measure; do not eyeball. Print actual numbers, never the word "pass".

Two rules, both learned the hard way here:
- If a metric reads the same before and after a change you made, the
  METRIC is broken. Prove each one fails on a deliberately wrong input
  before you trust it passing.
- Never loosen a threshold to make a check pass. If a threshold cannot be
  met, that is the result — report it. In M0 two thresholds turned out to
  be wrong, and they were found precisely because the implementer
  reported the mismatch instead of adjusting the number.

## Stopping

Stop and report after 3 failed attempts at the same problem: what you
tried, what you observed, what you think is wrong. Do not thrash.

When done: run the mobile tests, `npx tsc --noEmit`, and
`sh scripts/lint_greps.sh all`. Confirm the web client is still green
(`cd client && pnpm vitest run`). Commit with a message stating what you
MEASURED, not what you intended.

DO NOT START THE NEXT PHASE. Not even if this one passes cleanly and the
next looks small. Stop at the end of this phase and report. Beginning the
next phase uninstructed is a failed task regardless of the code.
```

---

## M6 — the interactive widget

```
You are implementing phase M6 of the Eudaimonia stack migration.
Repo: /mnt/storage/Study/Eudaimonia   Branch: git checkout -b M6-widget from main

Read first: docs/implementation/PHASE-M-STACK-MIGRATION.md (M6 + ground
rules) · docs/plan/v1/05-screens-desktop-widgets.md — its KWGT plan is
withdrawn but its LAWS are not, and they are why this phase is shaped
the way it is

## Build

One Android home-screen widget that can act. This is the requirement the
whole migration exists for.

INTERACTIVE DOES NOT MEAN "WRITES LOCALLY". The widget's action POSTs to
the server spine exactly as the app does, through the same idempotency
guard. Single-writer (02 §6) is NOT relaxed by this phase. The widget
knocks; the server writes. A widget that mutates local state and syncs
later is a second writer and is the one thing this architecture forbids.

The widget renders server-supplied data and MUST show its `age_minutes`.
Coverage honesty at a glance is the whole point — a widget that cannot
say how stale it is lies by omission.

## Tests

- renders live data WITH the age line
- stale data renders visibly stale — show it, with the data deliberately
  aged
- its action produces EXACTLY ONE spine event
- killing the app does not strand a widget write — the write still lands
- the widget never shows a fabricated count; missing data renders as
  missing, never as zero (law 7)
```

```
## Hard rules — breaking any of these fails the task

1. Never edit anything under app/ — that is the server, untouched by this
   migration. If the port appears to need a server change, that is a sign
   the port is wrong. Stop and say so.
2. Never edit anything under client/ — the web app must stay green and
   deployable until M8. It is your reference.
3. Never delete anything under preserved/
4. Never run or modify preserved/torn-paper-web/generators/author_tears.py
   The tear contours in it are hand-drawn point tables. Use the committed
   SVG/PNG assets as-is.
5. Colour comes from mobile/src/theme/tokens.ts. Never write a hex literal
   in a component — scripts/lint_greps.sh fails the build on it.
6. Never add a glow, stroke, outline, drop-shadow or rim along a tear
   contour. Light placed relative to the contour FOLLOWS the contour,
   which is an outline however subtle. This shipped three times on the
   web before it was understood.
7. Port the LAWS, not just the code. Every invariant in
   docs/plan/v1/02-architecture.md §6 applies to the new client.
8. A value that a comment asserts gets a test. Two tokens have silently
   contradicted their own comments in this project; each cost multiple
   rounds of debugging.

## Verification — this is most of the job

Measure; do not eyeball. Print actual numbers, never the word "pass".

Two rules, both learned the hard way here:
- If a metric reads the same before and after a change you made, the
  METRIC is broken. Prove each one fails on a deliberately wrong input
  before you trust it passing.
- Never loosen a threshold to make a check pass. If a threshold cannot be
  met, that is the result — report it. In M0 two thresholds turned out to
  be wrong, and they were found precisely because the implementer
  reported the mismatch instead of adjusting the number.

## Stopping

Stop and report after 3 failed attempts at the same problem: what you
tried, what you observed, what you think is wrong. Do not thrash.

When done: run the mobile tests, `npx tsc --noEmit`, and
`sh scripts/lint_greps.sh all`. Confirm the web client is still green
(`cd client && pnpm vitest run`). Commit with a message stating what you
MEASURED, not what you intended.

DO NOT START THE NEXT PHASE. Not even if this one passes cleanly and the
next looks small. Stop at the end of this phase and report. Beginning the
next phase uninstructed is a failed task regardless of the code.
```

---

## M7 — push notifications

```
You are implementing phase M7 of the Eudaimonia stack migration.
Repo: /mnt/storage/Study/Eudaimonia   Branch: git checkout -b M7-push from main

STOP IF NOT WRITTEN: notifications appear in NO v1 design doc. The policy
gap is logged in docs/plan/v1/10-stack-migration.md §7 and must be closed
and written down BEFORE this phase. Check it has been. If it has not,
stop and report — do not invent notification policy in code. What may
notify and what may never is a product decision, not an implementation
detail.

Read first: the closed §7 policy · docs/implementation/
PHASE-M-STACK-MIGRATION.md (M7 + ground rules) · docs/plan/v1/
02-architecture.md §6

## Build

Push delivery for server-side events, per the ratified policy.

Alerts originate on olympus — agents and crons run THERE, not on the
phone. The phone receives. Do not build a phone-side scheduler; no mobile
OS offers reliable phone-side cron anyway (Android WorkManager floors at
~15 min and defers under Doze).

## Tests

- a server-side agent event reaches the device
- a notification action DEEP-LINKS and never writes directly
- quiet hours honoured, including the interaction with the 6am wake
  surface
- a notification carrying stale data says so
- no notification fabricates a count
```

```
## Hard rules — breaking any of these fails the task

1. Never edit anything under app/ — that is the server, untouched by this
   migration. If the port appears to need a server change, that is a sign
   the port is wrong. Stop and say so.
2. Never edit anything under client/ — the web app must stay green and
   deployable until M8. It is your reference.
3. Never delete anything under preserved/
4. Never run or modify preserved/torn-paper-web/generators/author_tears.py
   The tear contours in it are hand-drawn point tables. Use the committed
   SVG/PNG assets as-is.
5. Colour comes from mobile/src/theme/tokens.ts. Never write a hex literal
   in a component — scripts/lint_greps.sh fails the build on it.
6. Never add a glow, stroke, outline, drop-shadow or rim along a tear
   contour. Light placed relative to the contour FOLLOWS the contour,
   which is an outline however subtle. This shipped three times on the
   web before it was understood.
7. Port the LAWS, not just the code. Every invariant in
   docs/plan/v1/02-architecture.md §6 applies to the new client.
8. A value that a comment asserts gets a test. Two tokens have silently
   contradicted their own comments in this project; each cost multiple
   rounds of debugging.

## Verification — this is most of the job

Measure; do not eyeball. Print actual numbers, never the word "pass".

Two rules, both learned the hard way here:
- If a metric reads the same before and after a change you made, the
  METRIC is broken. Prove each one fails on a deliberately wrong input
  before you trust it passing.
- Never loosen a threshold to make a check pass. If a threshold cannot be
  met, that is the result — report it. In M0 two thresholds turned out to
  be wrong, and they were found precisely because the implementer
  reported the mismatch instead of adjusting the number.

## Stopping

Stop and report after 3 failed attempts at the same problem: what you
tried, what you observed, what you think is wrong. Do not thrash.

When done: run the mobile tests, `npx tsc --noEmit`, and
`sh scripts/lint_greps.sh all`. Confirm the web client is still green
(`cd client && pnpm vitest run`). Commit with a message stating what you
MEASURED, not what you intended.

DO NOT START THE NEXT PHASE. Not even if this one passes cleanly and the
next looks small. Stop at the end of this phase and report. Beginning the
next phase uninstructed is a failed task regardless of the code.
```

---

## M8 — cutover

```
You are implementing phase M8 of the Eudaimonia stack migration — the
last one. Repo: /mnt/storage/Study/Eudaimonia
Branch: git checkout -b M8-cutover from main

Read first: docs/implementation/PHASE-M-STACK-MIGRATION.md (M8 + ground
rules) · scripts/ops-deploy.sh in full

## Build

Retire the web client, or demote it to the desktop console — whichever
the owner has decided. Update scripts/ops-deploy.sh accordingly.

NOTE: rule 2 of the standing rules (never edit client/) is lifted FOR
THIS PHASE ONLY, and only as far as the decision requires. Rules 1, 3
and 5-8 still hold.

DO NOT delete preserved/torn-paper-web/ in this phase unless the owner
has explicitly signed off. It is the only complete record of why the
surface looks the way it does, and it costs 6MB.

ops-deploy.sh has two hard-won behaviours — do not regress them:
- it waits for the old process to exit and requires the serving PID to
  have CHANGED, because the health check could otherwise answer from the
  process you meant to replace
- it verifies the ORIGIN is serving the expected build id, because 200 +
  404 only prove the tunnel is up, not that the bundle shipped

## Tests

- nothing in the deploy path references the retired client
- the origin still serves the stamped build, verified by the deploy's own
  build-id check
- a full deploy run completes without hanging and reports changed PIDs
- the app on device still reaches the API after the cutover
```

```
## Hard rules — breaking any of these fails the task

1. Never edit anything under app/ — that is the server, untouched by this
   migration. If the port appears to need a server change, that is a sign
   the port is wrong. Stop and say so.
2. Never edit anything under client/ — the web app must stay green and
   deployable until M8. It is your reference.
3. Never delete anything under preserved/
4. Never run or modify preserved/torn-paper-web/generators/author_tears.py
   The tear contours in it are hand-drawn point tables. Use the committed
   SVG/PNG assets as-is.
5. Colour comes from mobile/src/theme/tokens.ts. Never write a hex literal
   in a component — scripts/lint_greps.sh fails the build on it.
6. Never add a glow, stroke, outline, drop-shadow or rim along a tear
   contour. Light placed relative to the contour FOLLOWS the contour,
   which is an outline however subtle. This shipped three times on the
   web before it was understood.
7. Port the LAWS, not just the code. Every invariant in
   docs/plan/v1/02-architecture.md §6 applies to the new client.
8. A value that a comment asserts gets a test. Two tokens have silently
   contradicted their own comments in this project; each cost multiple
   rounds of debugging.

## Verification — this is most of the job

Measure; do not eyeball. Print actual numbers, never the word "pass".

Two rules, both learned the hard way here:
- If a metric reads the same before and after a change you made, the
  METRIC is broken. Prove each one fails on a deliberately wrong input
  before you trust it passing.
- Never loosen a threshold to make a check pass. If a threshold cannot be
  met, that is the result — report it. In M0 two thresholds turned out to
  be wrong, and they were found precisely because the implementer
  reported the mismatch instead of adjusting the number.

## Stopping

Stop and report after 3 failed attempts at the same problem: what you
tried, what you observed, what you think is wrong. Do not thrash.

When done: run the mobile tests, `npx tsc --noEmit`, and
`sh scripts/lint_greps.sh all`. Confirm the web client is still green
(`cd client && pnpm vitest run`). Commit with a message stating what you
MEASURED, not what you intended.

DO NOT START THE NEXT PHASE. Not even if this one passes cleanly and the
next looks small. Stop at the end of this phase and report. Beginning the
next phase uninstructed is a failed task regardless of the code.
```

---

## Verifying between phases

Hand the finished phase back for review before taking the next prompt.
What to look for yourself, in thirty seconds:

1. **Are there numbers?** A report with "all checks passed" and no
   measured values is an unfinished phase. This is the single most
   common failure mode.
2. **Did it stop?** If it started the next phase uninstructed, the gate
   is not working — say so in the next prompt.
3. **Is the web client still green?** `cd client && pnpm vitest run`
4. **Does the lint pass?** `sh scripts/lint_greps.sh all`
5. **Did anything outside `mobile/` change?**
   `git diff --name-only main...<branch> | grep -v '^mobile/'`
