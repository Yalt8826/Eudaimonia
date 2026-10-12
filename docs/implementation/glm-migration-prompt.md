# Agent prompts — driving the Expo migration

The migration is M0–M8 (`PHASE-M-STACK-MIGRATION.md`), several weeks of
work. **Do not ask an agent to do it in one prompt.** One phase per
session, each ending in a committed, verified state. M0 is a go/no-go
gate and must be driven alone.

---

## Prompt 1 — M0, the Skia spike (paste as-is)

```
You are implementing phase M0 of a stack migration for Eudaimonia, a
personal life-OS app. Repo: /mnt/storage/Study/Eudaimonia

## Read before writing any code, in this order

1. docs/implementation/mint-sheet-skia-brief.md   — your task, in full
2. preserved/torn-paper-web/README.md             — why the surface looks right
3. docs/implementation/PHASE-M-STACK-MIGRATION.md — the M0 section only

Do not write or run code until you have read all three. The brief
contains exact colour values, geometry and acceptance thresholds. Use
them verbatim; do not re-derive them.

## Your task

Build ONE mint sheet of torn paper in a new Expo app using
@shopify/react-native-skia: black torn skin above and below, mint paper
between, fibrous relief along both cuts. It must match
preserved/torn-paper-web/renders/mint-390px.png

Put the Expo app in a new top-level directory: mobile/
Branch: git checkout -b M0-skia-spike

## Scope — M0 is ONE SHEET

Do NOT build: routing, navigation, other screens, the other four sheets,
data fetching, the offline queue, animation. Those are M1-M8. A spike
that grows into the whole app is a failed spike.

## Hard rules — breaking any of these fails the task

1. Never edit anything under app/ — that is the server, untouched by this
   migration.
2. Never edit anything under client/ — the existing web app must stay
   green and deployable; it is your reference render.
3. Never run or modify preserved/torn-paper-web/generators/author_tears.py
   The tear contours inside it are hand-drawn point tables. Regenerating
   risks losing them. Use the committed SVG and PNG assets as-is.
4. Never delete anything under preserved/
5. Never add a glow, stroke, outline, drop-shadow or rim along the tear
   contour. The relief is already baked into the fringe PNGs. Light
   placed relative to the contour FOLLOWS the contour, which is an
   outline however subtle — this was the single hardest bug in the web
   version and it shipped three times.
6. Use paper-fibers.prepared.webp, never paper-fibers.webp.
7. Blend the texture with soft-light. Never multiply — it once rendered
   mint as #526B61 and dropped ink contrast from 9.81 to 2.58.

## How to verify — this is most of the job

Eyeballing is how every bug in the brief's trap list shipped. You must
MEASURE.

Write a script that screenshots your Skia render at 390px wide / 3x DPR
and computes each row of the acceptance table in the brief's section 7.
Print the actual numbers. Compare against
preserved/torn-paper-web/renders/mint-390px.png

Required evidence before you claim M0 passes:
- the acceptance table from the brief, filled in with YOUR measured
  numbers (not "pass" — the numbers)
- your render and the reference side by side
- the measurement script committed

Two rules about measuring, both learned the hard way on the web version:
- If a metric reads the same before and after a change you made, the
  METRIC is broken. Do not accept it. Sanity-check it against a
  deliberately wrong render and confirm it reports failure.
- Never loosen a threshold in the brief to make a check pass. If a
  threshold cannot be met, that is the result — report it.

## When you get stuck

Stop and report after 3 failed attempts at the same problem. Say what you
tried, what you observed, and what you think is wrong. Do not keep
retrying variations. A clear "M0 fails on the rim check, here are the
numbers" is a useful, correct outcome — M0 is a GO/NO-GO gate and a
failed spike is far cheaper than discovering the same thing after the
whole app is ported.

## Finishing

Commit with a message that states what you measured, not what you
intended. Then report:
- the filled-in acceptance table
- anything you could not match, and why
- your recommendation: GO or NO-GO on porting the rest

Do not start M1. Stop at the gate.
```

---

## Prompt 2 — continuation template (M1 onward)

Use once M0 is approved. Replace `<N>` and the two quoted sections.

```
You are implementing phase M<N> of the Eudaimonia stack migration.
Repo: /mnt/storage/Study/Eudaimonia

Read first, in this order:
1. docs/implementation/PHASE-M-STACK-MIGRATION.md — the M<N> section, and
   the "Ground rules specific to this phase" section at the end
2. docs/plan/v1/10-stack-migration.md §1 and §5
3. any doc the M<N> section names

Branch: git checkout -b M<N>-<slug> from a green main.

Scope: M<N> ONLY, exactly as the phase doc defines it. Do not start the
next phase.

Hard rules (unchanged every phase):
- never edit app/
- never edit client/ — the web client stays green and deployable until M8
- never delete preserved/
- port the LAWS, not just the code: every invariant in
  docs/plan/v1/02-architecture.md §6 applies to the new client
- a value that a comment asserts gets a test

Done when: the exit test in the phase doc's M<N> row passes, proved by
observed execution with numbers printed — never by intention. Report the
evidence, then stop.

If you believe the port needs a change under app/, that is a signal the
port is wrong, not the server. Stop and say so.
```

---

## Driving notes

- **One phase per session.** Review the evidence between phases; a flash
  model will otherwise carry a wrong assumption forward for weeks.
- **M0 is the real decision point.** If the Skia tear does not hold up,
  the honest options are pre-rendered PNG sheets at fixed widths (losing
  responsive tiling) or staying on the PWA with read-only widgets.
- **Ratify the motion amendment** (plan §6) before M4, or the project
  runs against a law it still claims to hold.
- **Close the notifications spec gap** (plan §7) before M7. It is a
  policy decision, not an implementation one — do not let it be invented
  in code.
- **Check the acceptance numbers yourself.** The most common failure mode
  for a fast model on this kind of task is a confident "all checks
  passed" with no numbers behind it. If the numbers are missing from the
  report, treat the phase as unfinished.
