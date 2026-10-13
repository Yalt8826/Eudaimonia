# Phase M — Stack migration (PWA → Expo)

**Size L · ~3–5 weeks · What it proves: the surface, the laws and the
offline contract all survive a change of renderer — and that interactive
widgets become possible without a second writer.**

The client moves from React/Vite to Expo. **The server does not move**:
every adapter, the spine, `agent_invoke` and the cron chains are
untouched, and no task in this phase may edit `app/`. The plan is
`docs/plan/v1/10-stack-migration.md`; read its §1 before anything else,
because one of the three stated reasons for this migration is not a
reason and building for it would add a second scheduler.

- **Ships:** Expo client at parity with the web Plaza · offline queue on
  expo-sqlite · signed APK · one interactive widget · push notifications.
- **Entry:** `main` green · the web client preserved under
  `preserved/torn-paper-web/` · **the [[01-design-system]] motion
  amendment ratified** (plan §6) — M4 cannot start without it.
- **Exit:** every M-row exit test below met, and the web client either
  retired or explicitly demoted to the desktop console.
- **Rollback:** the web client stays deployable for the whole phase.
  Until M8, rollback is "deploy `client/` as before" — the two live side
  by side and `ops-deploy.sh` keeps working unchanged.
- **Descope order if time runs short:** M7 push → M6 widget → M4 motion.
  **Never cut:** M0 (the gate), M3 (the offline contract).

**Read before starting:** `docs/plan/v1/10-stack-migration.md` in full ·
`preserved/torn-paper-web/README.md` (the surface, and the measurement
discipline that produced it) · `02-architecture.md` §6 (the invariants,
all of which survive) · `EXECUTION.md` Part I (ground rules, rollback
tiers, the no-rewrite rule).

---

## Task graph

```
M0 spike ──┬─> M1 shell ──> M2 Plaza ──> M4 motion ──┐
  (GATE)   │                   │                     ├─> M8 cutover
           └─> M3 data ────────┘                     │
                    └─> M5 APK ──> M6 widget ──> M7 push
```

M0 gates everything. M3 may run in parallel with M2 — different files,
different risk. M5 needs only the shell, so it can start early and prove
the build pipeline before the surface is finished.

---

## M0 — the Skia spike (GO/NO-GO)

**Build:** one mint sheet in a bare Expo app, per
`docs/implementation/mint-sheet-skia-brief.md`. Nothing else. No routing,
no data, no navigation.

**Why it is first:** the torn-paper surface is the single largest unknown
and the single largest sunk investment. Every other task in this phase is
ordinary porting work with a known shape; this one could fail. Finding
that out in two days costs two days. Finding it out after 22 routes are
ported costs the phase.

**Tests:** the acceptance table in the brief, filled in with measured
numbers — tint within 1/255, no continuous rim (<10% of columns above
luminance 35 at 1–2px above the contour), relief present and broken,
fibre legible at 3× DPR.

**Done when:** the measured table is recorded in the task's PR and a
side-by-side screenshot sits beside `renders/mint-390px.png`.

**If it fails:** stop the phase and re-decide. Options in order:
pre-rendered PNG sheets at fixed widths (loses responsive tiling), or
staying on the PWA and accepting read-only widgets. **Do not start M1 on
a failed M0** on the theory that the surface can be fixed later.

## M1 — shell and tokens

**Build:** expo-router with all 22 routes as stubs. Port `theme.css` to a
typed token object — one module, same names, comments and measured ratios
carried over verbatim. Port `contrast.test.ts` (pure maths, no DOM).

**Tests:** every route renders and is reachable; the contrast suite is
green; a route-count assertion matches the web `routes.test.tsx` so no
screen is silently dropped.

## M2 — the Plaza

**Build:** five sheets, three contours, the header (greeting, date,
daily line — `greeting.ts` ports unchanged), the nav cluster as static
bubbles. Motion comes in M4.

**Tests:** renders at 320 and 430 match
`preserved/torn-paper-web/renders/plaza-{320,430}px.png`; all five tints
within 1/255 of their tokens; no glyph within 6 CSS px of any fringe
pixel on any sheet; no two adjacent sheets share a contour.

## M3 — data and the offline contract

**Build:** API client, write queue on expo-sqlite, wake round-trip.

**[impl] The queue's semantics are not up for redesign.** Idempotency
guard, dedup and ordering carry over from `client/src/sw/queue.ts`; only
the storage changes. The spine stays append-only and the phone stays a
single writer through the server.

**Tests:** the P2 exit test, unchanged — airplane mode → tap → force-stop
→ reopen → **exactly one** event with the correct `ts`.

## M4 — motion

**Entry:** ratified 2026-10-13 — [[01-design-system]] §8. Read it first.

**Build:** the nav as a real radial gesture (press-and-hold to fan,
drag to select by angle, release to act — the geometry and angle maths
are specified in the parked web attempt; see `c0740e8`'s message for why
it was parked). Screen transitions.

**Tests:** gesture works on a physical device; `prefers-reduced-motion`
drops travel but keeps state changes; **no entrance animation on the wake
screen** (01 §8 keeps this); motion conveys no data.

## M5 — the APK

**Build:** EAS build profile, dev client, signed APK.

**Tests:** installs on device; cold start ≤2s to the Plaza; deep link
`web+eudaimonia://wake` lands on the wake route and **never degrades to a
browser chrome surface** (the TWA-era invariant in 02 §6 carries over).

## M6 — the interactive widget

**Supersedes** the KWGT plan in `05-screens-desktop-widgets.md`.

**[impl] Interactive does not mean "writes locally".** The widget's
action POSTs to the server spine exactly as the app does, through the
same idempotency guard. Single-writer (02 §6) is not relaxed by this
phase — the widget knocks, the server writes.

**Tests:** renders live data **with its `age_minutes` line**; stale data
renders visibly stale; its action produces exactly one spine event;
killing the app does not strand a widget write.

## M7 — push notifications

**Entry:** the §7 spec gap in the migration plan is closed and written
down. Notifications appear in **no** v1 doc today; do not invent the
policy in code.

**Tests:** a server-side agent event reaches the device; a notification
action deep-links and never writes directly; quiet hours honoured; a
notification carrying stale data says so.

## M8 — cutover

**Build:** retire the web client or demote it to the desktop console.
Update `ops-deploy.sh`. Delete `preserved/torn-paper-web/` **only after
sign-off** — it is the only complete record of why the surface looks
right.

**Tests:** nothing in the deploy path references the retired client; the
origin still serves the stamped build; the deploy's own
build-id verification still passes.

---

## Ground rules specific to this phase

1. **No task edits `app/`.** If the port seems to need a server change,
   that is a signal the port is wrong, not the server.
2. **Port laws, not just code.** Every invariant in 02 §6 applies to the
   new client. They are about honesty and writers, not about CSS.
3. **A value a comment asserts gets a test.** Carried over from the web
   client, where two tokens silently contradicted their own comments and
   cost a combined four rounds of work.
4. **Measure, don't eyeball** — and distrust a metric that reads the same
   before and after a change. The preserved README documents two metrics
   that fooled us by anchoring on the wrong reference point.
5. **The web client stays green until M8.** Any commit that breaks it
   before cutover is a defect, not a side effect of migration.
