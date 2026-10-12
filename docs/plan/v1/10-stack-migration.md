---
project: Eudaimonia
doc: Stack migration v1 — PWA → Expo
owner: praxis
status: spec'd for build (2026-10-12); supersedes the client half of
  [[02-architecture]] §2 and the widget half of [[05-screens-desktop-widgets]]
---

# Stack migration — PWA → Expo

## 1. Why, and what is NOT a reason

The client moves from a React/Vite PWA to Expo (React Native). Three
requirements were given; **two of them justify this and one does not**,
and the difference decides what gets built.

**Interactive widgets — the blocker.** [[05-screens-desktop-widgets]]
defines widgets as "doors, never paths": read-only renders of
`/widgets.json` that deep-link into the PWA. That spec is now withdrawn —
widgets must act. No PWA or TWA can do this. An Android home-screen
widget needs RemoteViews, which needs a native shell. This alone decides
the move.

**High motion fidelity — valid, with a cost.** Reanimated drives
animation off the JS thread; CSS cannot match it for interruptible,
gesture-driven motion. **This contradicts [[01-design-system]]**, whose L0
is "still static, always" and whose gate 4 is a literal string match that
trips on naming an animation construct in a comment. §6 below carries the
amendment. Do not start the port until it is ratified: otherwise every PR
fails a gate the project still claims to hold.

**Background execution — NOT a reason, and Expo would not supply it.**
Agents and crons run on olympus (`agent_invoke → hermes --profile`, cron
chains under `~/.hermes/profiles/*/cron/output/`). The phone never runs
them and does not need to. No mobile OS offers reliable phone-side cron:
Android WorkManager has ~15-minute floors and defers under Doze, iOS is
stricter. What is actually wanted is **alerts arriving reliably**, which
is push — and push is a spec gap today, absent from every v1 doc. §7.

Keeping this straight matters: build the phone as a client of the server's
schedule, not as a second scheduler. The single-writer law (02 §6) already
forbids the alternative.

## 2. Why now

Cheapest moment available. Current state: **P1 of P6**, 2 API endpoints,
5 screens with real content and 17 stubs. At P4 the weekly review, agent
console, server screen and timeline would all be built twice. The backend
is untouched by this migration — only the client moves.

## 3. What survives, what is rebuilt

| survives unchanged | rebuilt |
|---|---|
| the entire FastAPI backend, schema, adapters | 21 components' styling → StyleSheet |
| `scripts/author_tears.py` — still emits SVG + PNG | the torn-paper renderer → Skia |
| pure logic: `plazaModel`, `greeting`, ISO-week, queue dedup | 22 routes → expo-router (mechanical) |
| the design tokens, as a TS object | SW precache + offline queue → expo-sqlite + background task |
| `contrast.test.ts` — pure maths | ~131 tests: CSS assertions die, logic and contrast live |

The web implementation is preserved whole under
`preserved/torn-paper-web/`, including the measurement discipline that
produced it. Read its README before porting the surface.

## 4. Execution — phases with exit tests

Same contract as [[02-architecture]] §5: no phase is done until its exit
test passes. **M0 is a go/no-go gate, not a formality.**

| Phase | Ships | Exit tests |
|---|---|---|
| **M0** | Skia spike: the mint sheet only — tear mask, fibre texture, fringe — in a bare Expo app | side-by-side with `preserved/.../renders/mint-390px.png`: tint within 1/255 of `#A9DCC7`, no continuous rim above the contour, fine fibre still legible at 3× DPR. **Fails ⇒ stop and re-decide; do not port the rest first** |
| **M1** | shell: expo-router with all 22 routes as stubs, tokens as TS, `contrast.test.ts` ported | every route renders and is reachable; contrast suite green; no route lost against `routes.test.tsx` |
| **M2** | the Plaza: five sheets, the three contours, header, nav cluster | renders at 320/430 match the preserved references; text clears every tear per `tear-metrics.json`; all five tints within 1/255 |
| **M3** | data layer: API client, offline write queue on expo-sqlite, wake round-trip | airplane-mode tap → force-stop → reopen → exactly one event with the correct `ts` (same test as P2) |
| **M4** | motion: the nav as a real radial gesture, screen transitions | gesture works on device; `prefers-reduced-motion` honoured; no animation on the wake screen (01 §6 survives the amendment) |
| **M5** | APK: EAS build, dev client, install on device | signed APK installs; cold start ≤2s to the Plaza; deep link `web+eudaimonia://wake` lands on the wake route |
| **M6** | interactive widget (replaces the KWGT plan) | widget renders live data **with `age_minutes`**; its action writes through the server spine, not locally; stale data renders stale |
| **M7** | push notifications (new; see §7) | a server-side agent event reaches the device; notification actions deep-link, never write directly |
| **M8** | cutover: web client retired or demoted to the desktop console | nothing references `client/` in deploy; `ops-deploy.sh` updated; `preserved/` deleted only after sign-off |

## 5. Rules that carry over unchanged

Every behavioural law in [[02-architecture]] §6 survives the stack change
and none of them are about CSS:

- widgets never write directly — they knock, the server writes
- no fabricated counts; `age_minutes` on every widget surface
- single-writer statuses
- one agent primitive (`agent_invoke`)
- coverage honesty, dormancy muted never red, freshness ≠ success
- **a value a comment asserts gets a test** — learned twice the hard way
  in the web client (see the preserved README)

## 6. Amendment to [[01-design-system]] — motion

Required before M4, and ratifying it is a decision, not paperwork.

- **L0 stays static.** The matte skin and the paper grain carry no
  animation frames. Gate 4 keeps its string match on the *grain assets*.
- **Motion is permitted on interaction**, which is new: gesture-driven
  transforms, radial menus, screen transitions, spring physics.
- **Unchanged:** 150–200ms for state changes, no entrance animation on the
  wake screen, `prefers-reduced-motion` honoured everywhere.
- **New ceiling:** motion never conveys data. Liveness, staleness and
  state remain colour and text — never speed, bounce or direction. This is
  hue-never-carries-data, extended to the time axis.

## 7. Spec gap to close — notifications

Alerts appear in no v1 doc. Before M7, decide and write down:

- what may notify (agent completion? a waiting-on ageing past a
  threshold? a cron failure?) and what may never
- whether a notification can carry an action, or only a deep link — the
  single-writer law suggests deep link only
- quiet hours, and how they interact with the 6am wake surface
- what a notification says when its data is stale

## See also

[[02-architecture]] (server, unchanged; client sections superseded) ·
[[01-design-system]] (§6 amendment above) ·
[[05-screens-desktop-widgets]] (widget section superseded by M6) ·
`preserved/torn-paper-web/README.md` (the surface, and why it looks right)
