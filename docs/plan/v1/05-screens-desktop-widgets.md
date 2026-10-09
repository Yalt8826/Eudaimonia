---
project: Eudaimonia
doc: Screens v1 — PC + Widgets
owner: praxis
status: spec'd for build (2026-10-08); wake lifecycle + split-plane
amendment 2026-10-09 RATIFIED (Noesis two-pass, 2026-10-09)
---

# Screens — PC & Widgets

Same server, same tokens. The PC client is the **same PWA installed as a
standalone window** (Chromium "Install app" / Edge "Apps") — one codebase,
no Electron/Tauri, no second UI to rot. The wide layout is a media-query,
not a fork.

## `/` — Plaza, wide (≥ 1024px)

Twelve-column grid; same content, same order, more columns — never new
content:

```
┌────────────────────────────────────────────────────────────────────┐
│ Eudaimonia            Today · Wed Oct 8          ⚙   ＋ capture    │
├──────────────────────┬──────────────────────┬─────────────────────┤
│ TODAY'S PLAN         │ WAITING ON (3)       │ AGENTS              │
│ dMAT 3:00            │ reply APS India      │ zetesis 🔴 repair   │
│ GRE 3:45–6:45        │ kanban ×2 parked     │ 3 crons paused ●    │
│ Gym 7:00             │ [done][roll][drop]   │ invocation feed →   │
│ plan stale 38d ⚠     │                      │                     │
├──────────────────────┼──────────────────────┤                     │
│ WAKE ● 4 of 7  [tap] │ YESTERDAY ● vio      │ SERVER              │
│                      │ reports 1 of last 7  │ 4 containers ●      │
│ NUTRITION · dormant  │ narrated by Noesis   │ multica stack ● up  │
│ 0 of 7 · Aug 16      │ (chat)               │ caddy · relay · …   │
├──────────────────────┴──────────────────────┴─────────────────────┤
│ READING · 80 queued · digest paused ●     TIMELINE (today) →      │
└────────────────────────────────────────────────────────────────────┘
```

Glass cards on the 6% tier; the review still opens on paper. Keyboard:
`c` capture · `g i` inbox · `g w` week · `?` palette — the app is
keyboard-first on desktop. Wide = same laws: one blur layer, coverage
lines everywhere, two-tap depth.

## Weekly review, wide

True two-pane reading: mechanical sections left nav (sticky), rendered
document right on paper tier; narrated sections flagged plum; "Export"
pins the staged write-back. The numeral gate runs before render here too.

## Capture — PC paths

- **Fuzzel (athena, Wayland-native):** Hyprland keybind → fuzzel prompt →
  `curl POST /capture` — zero GUI, lands in the same inbox.
- **In-app:** `c` keybind → compose sheet → agent triage.
- Share-target registration so "share to Eudaimonia" works from other PC
  apps that support it.

## `/agents`, `/server`, `/timeline` — wide notes

Agents: table layout, one row per profile, state dots + reasons, sort by
state (dead first). Server: same rows + 24h sparklines; read-only,
restart buttons exist nowhere. Timeline: virtualized table, filter chips,
CSV copy-out (provenance columns included).

---

# Widgets

Laws first: **widgets are doors, never paths.** They render
server-supplied data + `age_minutes` (coverage honesty at a glance) and
deep-link into the PWA for any action. One write path exists: the server's
event spine; the PWA is its only interactive client.

## Android — KWGT (v1)

- Reads `/widgets.json` (waiting-on count, wake chip "● 4 of 7", reading
  count, digest state, `age_minutes`, palette tokens) at minutes cadence;
  "last sync" line renders staleness honestly. **Caveat carried from
  research:** network formulas may require KWGT Pro (~$4, one-time) —
  pre-approved by @user 2026-10-09; still verify on-device first.
- **Wake tap:** widget tap → deep-link `web+eudaimonia://wake` → the PWA's
  hard-mode wake screen → pre-filled auto-POST. Same endpoint, same
  idempotency guard as the offline queue — the widget knocks, the app
  writes.

### Wake lifecycle (split-plane + TWA amendment, 2026-10-09)

- **Scheme: `web+eudaimonia`.** WHATWG-legal for browser-context
  registration (`registerProtocolHandler` requires `web+`-prefixed lowercase —
  the pre-APK PWA can register the wake route itself) and Android intent
  filters accept it as-is. Zero consumers before P6, so adoption happens at
  TWA day — first use, not migration.
- **TWA day (P6):** Bubblewrap `twa-manifest.json` `protocolHandlers` maps
  `web+eudaimonia://wake` → the wake URL; regen-stable via Bubblewrap's
  `ProtocolHandlersFeature` (intent filter re-injected on every `bubblewrap
  update` — no hand-edits). KWGT → scheme → TWA LauncherActivity → wake URL.
- **Verification: Path 3.** Public origin `yalt8826.com` (Cloudflare Tunnel →
  olympus static plane). Chrome's on-device DAL check fetches
  `https://yalt8826.com/.well-known/assetlinks.json`, which resolves on- AND
  off-tailnet — verification never geofenced. Per 02 §6, the public plane
  serves shell/manifest/SW/assetlinks only; `/api/*` stays tailnet-only.
- **Both registration paths resolve to the same precached `/wake` route.**
  The APK deep-link never becomes a second wake surface — hard-mode law 9
  (02 §2) binds whichever URL the scheme lands on.
- **The wake route never degrades to a Custom Tab.** An unverified/degraded
  install showing the URL bar on the wake surface is a build-blocking defect
  (02 §6 invariant), not cosmetics. Exit tests: KWGT E2E (scheme → wake
  route, no chooser after first-use "Always", cold start ≤2s); pre-APK
  browser-context `web+eudaimonia://wake` opens the registered wake route;
  off-tailnet phone — `/` and `/.well-known/assetlinks.json` return 200,
  `/api/*` unreachable, wake tap rides the SW queue.
- Widget skin reads palette tokens from `/widgets.json`, so a theme flip
  re-skins the widget with zero preset surgery.

## PC (athena) — Hermes desktop panel (v1)

The Hermes desktop app's widget SDK (iframe-sandboxed, can talk back
through the host) hosts an Eudaimonia panel: same `/widgets.json`, same
tokens, click-through opens the installed PWA. This replaces the earlier
Quickshell-QML idea — fewer moving parts, channel already exists.
(Noesis's QML strip remains the fallback if the SDK can't reach tailnet
URLs — probe at build time.)

## What widgets will never do (v1)

Write directly · nag (the PWA inbox is the nagger) · render without their
`age_minutes` line · use accent colors for liveness (fixed state colors
only; behavioral dormancy renders muted, never red).

## See also

[[01-design-system]] (tokens, widget token contract) ·
[[03-feature-list]] · [[04-screens-pwa]] (phone counterparts) ·
[[06-index]] (MOC)
