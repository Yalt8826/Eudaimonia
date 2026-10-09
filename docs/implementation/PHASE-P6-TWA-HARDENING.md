# Phase P6 — TWA, KWGT widget, desktop panel, tunnel, hardening

**Size L · ~10–14 nights · Entry: P5 exit AND domain purchased · Rollback: T1**
(everything here regenerates — static plane, `twa-manifest.json` → APK, widget
presets; the restore drill deliberately exercises T3). Proves: **the app is a
real installed Android + desktop citizen whose wake surface can never silently
degrade.**

**Read before starting:** `05-screens-desktop-widgets.md` IN FULL — the wake
lifecycle + split-plane amendment (2026-10-09) is this phase's source of truth ·
`02-architecture.md` §5 (P6 row incl. the off-tailnet exit test), §6
(public-plane invariant; wake-never-degrades), §2 law 9 (hard-mode surfaces) ·
`01-design-system.md` §5 (widget self-glass law) + §1 (token + state-color
tables) · `EXECUTION.md` §1 (restore drill = byte-equal), Part III (T6.0
timing), Part IV (P6 descope).

**Frozen decisions riding this phase** (never re-argued): origin =
`yalt8826.com`, Cloudflare Tunnel static plane (split-plane amendment RATIFIED
2026-10-09) · scheme `web+eudaimonia` adopts **at TWA day** — first use, not
migration (zero consumers before P6) · KWGT Pro ~$4 pre-approved by user
2026-10-09 (still verified on-device first, T6.3) · any public `/api` route is
a build-blocking defect (`02 §6`).

## Task graph

```
T6.0 domain + CF Tunnel wiring    ← out-of-order branch: gates T6.1 only,
     │                              any weekend early (EXECUTION Part III)
     ▼
T6.1 static plane deployment
     │
     ├── T6.2 Bubblewrap TWA ──────┬──────────────► T6.6 wake E2E suite
     │                             │                (legs 1–3; needs T6.2
     ├── T6.3 KWGT widget preset ──┘                 + T6.3's tap source)
     │        │
     │        └──────────────────────────────────► T6.5 hardening +
     │                                              restore drill
     └── T6.4 Hermes desktop panel  (probe at build time → SDK,
                                     or documented QML fallback)
```

T6.5 depends on T6.1 + T6.2 and runs parallel with T6.6; T6.4 is the
phase's first descope (the PWA window already covers it).

---

### T6.0 — Domain + Cloudflare Tunnel wiring

**Reads:** `02 §1` topology (public line), `02 §6` public-plane invariant,
`EXECUTION` Part III
**Depends on:** — (this task runs OUTSIDE phase order — `EXECUTION` Part III;
it contributes the "domain purchased" half of P6 entry and gates T6.1 alone)
**Parallel with:** everything — it is the out-of-order branch
**Tier:** T1

**Build**
- Buy `yalt8826.com`; zone on Cloudflare.
- `cloudflared` on olympus: `tunnel create eudaimonia`; systemd unit
  `cloudflared-eudaimonia.service` (`tunnel run`); DNS CNAME
  `<tunnel-id>.cfargotunnel.com` (proxied). Ingress: hostname
  `yalt8826.com` → `http://127.0.0.1:<static-port>` (the T6.1 file server;
  placeholder dir until then).
- **Public-plane allowlist: ONE grep-able config file**
  (`deploy/public-allowlist.conf`) enumerating exactly: `/` (=index.html),
  `/manifest.webmanifest`, `/sw.js`, `/.well-known/assetlinks.json`. Ingress
  rules: allowlist match → static dir; catch-all → 404 at the tunnel edge.
  Any public `/api` route is a build-blocking defect (`02 §6`); the data plane
  stays tailnet-gated at the tunnel edge, keeping "no auth" true.
- TLS: edge cert is Cloudflare-managed (auto-renew); renewal check = weekly
  probe script `deploy/probe-public.sh` — `curl -sI https://yalt8826.com/`
  from a non-tailnet vantage + `openssl s_client` expiry read; probe output
  lands in a cron output dir so it rides coverage (law 1: probe asserts
  status, never just "command ran").

**Tests**
- `dig +short yalt8826.com @1.1.1.1` answers (public DNS, not MagicDNS).
- `cloudflared tunnel info eudaimonia` shows an active connector; unit is
  `enabled` and survives an olympus reboot.
- `grep -c '^/' deploy/public-allowlist.conf` = 4;
  `grep -i api deploy/public-allowlist.conf` → zero matches.
- Off-tailnet vantage: the hostname answers (status may be 404/502 from the
  placeholder — the TUNNEL is what this task proves).

**Done when**
- [ ] Public DNS resolves off-tailnet; tunnel connector green
- [ ] Allowlist file greps to exactly the four routes, zero `api` matches
- [ ] Weekly public probe runs and records its result

**If it fails**

Unreachable off-tailnet but green on-tailnet: split-horizon
is eating the name; the public hostname must resolve via public DNS, never via
a tailnet override. Connector flaps: check `journalctl -u
cloudflared-eudaimonia` on olympus before touching Cloudflare config.

**Commits**
`chore(T6.0): start tunnel wiring — baseline green` →
`feat(infra): yalt8826.com tunnel, static ingress, grep-able public allowlist`

---

### T6.1 — Static plane deployment

**Reads:** `02 §1`, `02 §6`; T6.0's allowlist; `EXECUTION` §2 (T1)
**Depends on:** T6.0
**Parallel with:** — (gates T6.2, T6.3's E2E leg, T6.5, T6.6)
**Tier:** T1

**Build**
- `deploy/static.sh`: SPA production build → rsync `dist/` to the olympus
  static dir → smoke `curl`. Static dir holds: `index.html`,
  `manifest.webmanifest`, `sw.js`, icons, `assets/`, and
  `.well-known/assetlinks.json` (endpoint + serve config HERE; content
  finalized in T6.2 once the signing key exists).
- File server on olympus bound to `127.0.0.1` only — the tunnel is the sole
  ingress — as a systemd unit. Cache headers: `index.html` + `sw.js` +
  `assetlinks.json` = no-cache; `assets/*` immutable (the SW update path must
  stay live).
- **Install flip:** the phone's PWA installs from the public origin from now
  on (SW + install need https). Drain any device-local SW queue on the old
  tailnet-origin dev install BEFORE uninstalling it — queued taps are
  device-local and do NOT cross an origin flip; the spine on olympus loses
  nothing.

**Tests**
- Off-tailnet phone (LTE): `/`, `/manifest.webmanifest`, `/sw.js`,
  `/.well-known/assetlinks.json` all 200 with correct content-types;
  `/api/plaza` → 404 FROM THE EDGE (`02 §6`); `/nonexistent` → 404.
- On-tailnet regression: the tailnet API answers as before — the planes
  never share a route.
- SW activates on the public origin (devtools); Lighthouse installable.

**Done when**
- [ ] Off-tailnet: `/` and `/.well-known/assetlinks.json` return 200 (first
      half of the phase exit test; the two-pass repeat lives in T6.5)
- [ ] Off-tailnet `/api/*` → 404 at the edge
- [ ] PWA re-installed from the public origin; pre-flip queue drained

**If it fails**

200s only on-tailnet: DNS split-horizon (fix at T6.0). A
leaked `/api` path: the catch-all 404 is mis-ordered or missing — build-blocking
defect (`02 §6`); fix before any other P6 task merges.

**Commits**
`chore(T6.1): start static plane — baseline green` →
`feat(infra): static plane via tunnel, cache headers, edge-deny for /api`

---

### T6.2 — Bubblewrap TWA

**Reads:** `05 wake lifecycle` (amendment 2026-10-09) IN FULL; `02 §6`
(Custom-Tab invariant); `02 §2` law 9
**Depends on:** T6.1
**Parallel with:** T6.3, T6.4
**Tier:** T1 (`twa-manifest.json` regenerates the APK)

**Build**
- `bubblewrap init --manifest https://yalt8826.com/manifest.webmanifest`;
  `packageId`, `display: standalone`, theme/background colors from `01` tokens
  — TWA background = the wake teal (`--accent-1`) so the cold open never
  flashes a foreign surface (`04` wake spec: no splash affordance).
- `twa-manifest.json` `protocolHandlers`: maps `web+eudaimonia://wake` →
  `https://yalt8826.com/habits/wake` (`04` route table). **Regen-stable via
  Bubblewrap's `ProtocolHandlersFeature`: the intent filter is re-injected on
  every `bubblewrap update` — hand-edits to the generated manifest are
  forbidden** (`05 wake lifecycle`).
- Signing key custody: keystore + passwords into the vault's secret-keeping
  convention + one off-box copy; fingerprint recorded by LOCATION, not value.
- `bubblewrap fingerprint` → SHA-256 into
  `.well-known/assetlinks.json` (statement:
  `delegate_permission/common.handle_all_urls`, android app =
  packageId + cert fingerprint) → redeploy static plane → verify 200.
- Pre-APK registration path: SPA adds
  `navigator.registerProtocolHandler('web+eudaimonia',
  '/habits/wake?src=pwa')` on the public origin (WHATWG requires the
  `web+`-prefixed lowercase form — `05 wake lifecycle`). Both registration
  paths resolve to the SAME precached `/habits/wake` route — the APK deep-link
  never becomes a second wake surface; law 9 binds whichever URL the scheme
  lands on.
- First install: `bubblewrap build` → sideload over adb. First scheme tap →
  handler chooser → choose the Eudaimonia TWA → **"Always"**.
- DAL verification (Path 3): Chrome's on-device check fetches
  `https://yalt8826.com/.well-known/assetlinks.json`, which resolves on- AND
  off-tailnet — verification is never geofenced (`05 wake lifecycle`).

**Tests**
- `adb shell pm verify-app-links --re-verify <pkg>` then `pm get-app-links
  <pkg>` → `yalt8826.com: verified` — run once on-tailnet, once off-tailnet
  (LTE).
- `adb shell am start -a android.intent.action.VIEW -d
  "web+eudaimonia://wake"` → TWA opens the wake route, full-bleed, NO URL bar.
- Regen-stability: `bubblewrap update` (no-op bump) → rebuild →
  `aapt dump xmltree` still shows the `web+eudaimonia` intent filter.
- Key custody rehearsal: fresh machine signs a throwaway build; `apksigner
  verify --print-certs` SHA-256 identical.

**Done when**
- [ ] DAL verified on- and off-tailnet (Path 3)
- [ ] Scheme tap opens the TWA wake route with no URL bar (`02 §6`)
- [ ] Regenerated APK keeps the intent filter — zero hand-edits
- [ ] Key + keystore + passwords backed up off-box; restore rehearsed,
      fingerprint equal

**If it fails**

Wake opens with a URL bar or a chooser that cannot be set to
"Always": DAL not verified. Re-check the assetlinks fingerprint against
`bubblewrap fingerprint` byte-for-byte and confirm Chrome fetches the PUBLIC
origin, not a tailnet name. Verification must pass on first install — a
wake surface that can degrade to a Custom Tab is a build-blocking defect
(`02 §6`), never cosmetics; nothing else in P6 merges until it passes.

**Commits**
`chore(T6.2): start Bubblewrap TWA — baseline green` →
`feat(android): TWA with web+eudaimonia handler, DAL-verified via public origin`

---

### T6.3 — KWGT widget preset

**Reads:** `05 Widgets` (KWGT + wake lifecycle) IN FULL; `01 §5` self-glass
law + `01 §1` token/state tables; `02 §4` /widgets.json contract
**Depends on:** tailnet API endpoints live (P5 exit); builds /widgets.json
here if absent
**Parallel with:** T6.2, T6.4 (its E2E leg waits for T6.2)
**Tier:** T2 (server endpoint) + T1 (preset file)

**Build**
- Server: `GET /widgets.json` — tailnet data plane ONLY, never the public
  allowlist (`02 §6`). Payload: waiting-on count, wake chip ("4 of 7"),
  reading count, digest state, `age_minutes`, active palette name, palette
  tokens + BOTH ink-pairs (glass and paper) per `01 §5` ("ships both
  ink-pairs alongside the palette tokens"). Values derive from the shared
  `coverage` view — one source, law 7.
- **KWGT Pro first:** install, verify network formulas fetch the tailnet URL
  ON-DEVICE before building anything (pre-approved ~$4, 2026-10-09; the
  caveat closes by observation, never optimism). Tailscale applies
  system-wide, so KWGT's fetch rides the tailnet; if it genuinely cannot →
  STOP and escalate to the user (the widget's data leg is a user call; the
  scheme/tap leg and wake exit tests are never cut).
- Preset `widgets/eudaimonia.kwgt.json` (in repo, not only on-device): glass
  chip behind every state-critical dot (self-glass law, `01 §5`); ALL colors
  consumed from `/widgets.json` tokens — a theme flip re-skins the widget
  with zero preset surgery (`05 wake lifecycle`); `age_minutes` + "last sync"
  line always rendered (`05`: widgets never render without it); wake tap →
  `web+eudaimonia://wake`. Liveness = the three fixed state colors from the
  payload's ink-pairs; behavioral dormancy muted, never red.

**Tests**
- On-device: KWGT fetches `http://<olympus-tailnet>:<port>/widgets.json` →
  counts + chips render (this IS the Pro verification).
- Theme flip in the palette picker → widget re-skins on next fetch, preset
  untouched.
- Airplane the phone: widget shows last data with `age_minutes` climbing and
  an honest "last sync" — never blanks, never fabricates (law 1 at widget
  scale).
- Off-tailnet: same honest staleness; the widget never reaches for the public
  plane (no `/widgets.json` in the allowlist — `02 §6`).

**Done when**
- [ ] KWGT Pro network formula verified ON-DEVICE
- [ ] Widget renders wake chip, waiting-on count, habit chips, `age_minutes`,
      token colors — and survives airplane-mode honestly
- [ ] Preset greps clean of hardcoded hex outside token passthrough
- [ ] Wake tap fires `web+eudaimonia://wake` (completion in T6.6)

**If it fails**

Pro's network items cannot fetch the tailnet URL: do not
silently descope. The data leg dies only by user call; the button-only widget
(scheme tap, no data) is the fallback shape to propose. The wake surface's
exit tests survive either way (`EXECUTION` Part IV).

**Commits**
`chore(T6.3): start KWGT preset — baseline green` →
`feat(widgets): /widgets.json + KWGT preset on the token contract`

---

### T6.4 — Hermes desktop panel

**Reads:** `05 PC (athena) — Hermes desktop panel`; `02 §4`
**Depends on:** /widgets.json (same endpoint as T6.3)
**Parallel with:** T6.2, T6.3
**Tier:** T1

**Build**
- **Probe FIRST** (`05`: "probe at build time"): can the Hermes desktop app's
  widget SDK — iframe-sandboxed, talks back through the host — load a tailnet
  URL? Probe = sandboxed frame fetching `/widgets.json`; record the observed
  result either way (CORS, mixed-content, sandbox flag — whatever it is).
- SDK path (expected): panel consumes the SAME `/widgets.json`, renders with
  the same tokens, click-through opens the installed PWA window (plaza route)
  — never a browser tab. No new API surface; read-only consumer like KWGT.
- QML fallback (only if the probe fails): write `widgets/qml-fallback.md` —
  the exact blocker, the panel config that would host it, what the SDK could
  not do. Do not silently ship QML when the SDK works, nor SDK when the probe
  failed.
- Widget laws bind here too: `age_minutes` line, fixed state colors only,
  never writes (`05` never-do list).

**Tests**
- Panel's waiting-on count equals the phone widget's at the same minute.
- Resolve a loop on the phone → panel updates on next fetch.
- Theme flip re-skins the panel (shared token contract).
- Click-through lands in the installed PWA window, no URL bar.

**Done when**
- [ ] Probe result recorded (SDK or QML), whichever way it went
- [ ] Panel live on /widgets.json, same numbers as the phone
- [ ] Click-through opens the installed PWA

**If it fails**

SDK cannot reach tailnet URLs: ship the documented QML
fallback and move on; the phase does not block here (`EXECUTION` Part IV —
desktop panel is P6's first cut; the PWA window already covers the need).

**Commits**
`chore(T6.4): start desktop panel — baseline green` →
`feat(desktop): Hermes panel on /widgets.json (or documented QML fallback)`

---

### T6.5 — Hardening + backup/restore drill

**Reads:** `EXECUTION` §1 (byte-equal) + §2 (T3); `02 §2` law 9, `02 §5` P6
row, `02 §6` (two-pass); `05 wake lifecycle` exit tests
**Depends on:** T6.1, T6.2
**Parallel with:** T6.6
**Tier:** T3 (this task deliberately exercises T3)

**Build**
- Backup automation: nightly `VACUUM INTO` (or `.backup`) of `eudaimonia.db`
  to the vault + one off-box copy; documented restore path: stop uvicorn →
  place backup → start → rebuild entity tables from the spine.
- **The drill** (`deploy/restore-drill.sh`): restore a real backup into a
  scratch db, re-derive EVERY entity table from `event` → **byte-equal rows
  or the phase does not exit** (`EXECUTION` §1). The script enumerates tables
  from the migration DDL — no hand-list — and compares per-table ordered-dump
  hashes; it exits non-zero naming the first unequal table. Never edit
  restored rows to force equality.
- Hardening sweep (two-pass per `02 §6` — different grep, different seat, or
  a cold re-read next day): public allowlist still exactly 4 routes (grep the
  config AND probe the edge); `agent_invoke` still the only hermes spawn
  (`02 §6` grep); blur ≤1 per screen; accent hex only in `theme.css`
  (`EXECUTION` §4); single-writer statuses untouched.
- **Off-tailnet exit test** (`02 §5` P6 row), phone off-tailnet: `/` → 200,
  `/.well-known/assetlinks.json` → 200, `/api/*` unreachable, wake tap rides
  the SW queue per law 9 — tap `ts` = tap time, `ingested_at` = retry time,
  idempotency key = device UUID. Re-run P2's airplane/force-stop/reopen test
  against the TWA build: the APK is a new context and the SW must ride it.

**Tests** — the drill and the sweep ARE the tests; nothing is eyeballed that
can be hashed.

**Done when**
- [ ] `deploy/restore-drill.sh` byte-equal on every table — run twice, second
      run against a different backup file
- [ ] Off-tailnet: 200/200, `/api/*` unreachable, queued tap ingests with its
      original ts
- [ ] Backup restores on scratch storage from the off-box copy with olympus
      out of the loop
- [ ] Hardening greps green under a second pass

**If it fails**

Byte-unequal rows: the rebuild mapping is lossy; fix the
rebuild, re-drill. Editing rows to match hides the bug — the spine is truth
(`EXECUTION` §1). Off-tailnet tap fails to queue: the SW precache list is
missing the wake route in the APK context — build-blocking (law 9); fix before
any P6 exit.

**Commits**
`chore(T6.5): start hardening — baseline green` →
`feat(hardening): restore drill byte-equal, off-tailnet exit green, two-pass sweep`

---

### T6.6 — Wake E2E suite

**Reads:** `05 wake lifecycle` exit tests IN FULL; `02 §2` law 9, `02 §6`
Custom-Tab invariant; `04` `/habits/wake` spec
**Depends on:** T6.2 (TWA + scheme), T6.3 (KWGT tap source)
**Parallel with:** T6.5
**Tier:** T1

**Build**
- `e2e/wake.sh` — three legs, scripted, all OBSERVED on the phone (the
  emulator is not the exit):
  1. **KWGT E2E cold start:** just-woken phone → KWGT tap →
     `web+eudaimonia://wake` → TWA LauncherActivity → wake route (`05 wake
     lifecycle`). Assert: no chooser (first-use "Always" set in T6.2),
     full-bleed teal, no URL bar, cold start ≤2s — `adb shell am start -W`
     timing plus stopwatch cross-check on the true KWGT→rendered path; three
     cold runs, worst one ≤2s.
  2. **Pre-APK browser-context round-trip:** on the PWA with NO APK
     installed (second device, or before first install — run this leg BEFORE
     T6.2's install if sequencing allows): a `web+eudaimonia://wake` trigger
     opens the registered wake route (`05` exit test).
  3. **Degradation tripwire:** `pm disable-user` the TWA → scheme tap → the
     suite asserts the wake route NEVER silently lands in a Custom Tab: URL
     bar visible on the wake surface = fail (`02 §6` — build-blocking, never
     waivable). The tripwire encodes the check so a future APK update that
     breaks verification fails loudly here, re-runnable via
     `e2e/wake.sh --kwgt|--preapk|--tripwire`, exit code = verdict.
- Cross-check: leg 1 once more on LTE (off-tailnet) → tap queues via SW,
  ingests on return (ties to T6.5's row).

**Tests**

The three legs above ARE the tests — they run on the handset and nothing
here is eyeballed that a script can assert. What the suite itself must
prove before its results count:

- `e2e/wake.sh --kwgt|--preapk|--tripwire` each exit non-zero on a forced
  failure and zero on a pass — **the tripwire is verified by forcing the
  URL bar once and watching it fail** (same rule as T0.6: a gate with no
  failing fixture is a gate nobody has proven fires)
- Cold-start timing comes from `adb shell am start -W` plus a stopwatch
  cross-check on the true KWGT→rendered path, three cold runs recorded
  individually — the worst run is the verdict, never the mean
- Every run writes its verdict and raw timings to `e2e/results/`; a leg
  with no recorded output did not happen

**Done when**
- [ ] Leg 1: KWGT tap → wake route, no chooser, no URL bar, ≤2s cold start
      (three cold runs, observed)
- [ ] Leg 2: pre-APK round-trip opens the registered wake route
- [ ] Leg 3: tripwire proven — it FAILS when the URL bar is forced, passes
      when not
- [ ] One script, three flags, exit code = verdict; results recorded in
      `e2e/results/`

**If it fails**

Chooser reappears after "Always": another handler claimed
the scheme (freshly installed browser); re-set Always in App → default apps.
Cold start >2s: profile before touching anything — the TWA splash/background
color flash and icon density are the usual Bubblewrap culprits (`04`: the
wake route cannot afford a splash); the route itself must render fully
offline (law 9 — the tap POST queues, it never blocks render).

**Commits**
`chore(T6.6): start wake E2E — baseline green` →
`feat(e2e): wake suite — KWGT cold start, pre-APK round-trip, Custom-Tab tripwire`

---

## Phase exit (P6)

Two-pass rule applies to the whole list (`02 §6`) — a second pass by different
grep, different seat, or cold re-read before exit is declared:

- [ ] Off-tailnet phone: `/` 200, `/.well-known/assetlinks.json` 200,
      `/api/*` unreachable, wake tap rides the SW queue (`02 §5` P6 row)
- [ ] KWGT E2E: scheme → wake route, no chooser after first-use "Always",
      cold start ≤2s (`05` exit tests)
- [ ] Wake never degrades: Custom-Tab tripwire green on the current APK
      (`02 §6` — build-blocking, never waivable)
- [ ] Restore drill: every entity table re-derived from the spine, byte-equal
      (`EXECUTION` §1)
- [ ] Widget renders live tokens + `age_minutes`; KWGT Pro caveat CLOSED by
      on-device observation (`02 §5` P6 row)
- [ ] Desktop panel live on /widgets.json — or the documented QML fallback
      with the recorded probe result
- [ ] Signing key custody: off-box backup + rehearsed restore, equal cert
      fingerprint
- [ ] Hardening greps green under a second pass

## Rollback + descope

Rollback T1 across the phase: static plane regenerates, `twa-manifest.json`
regenerates the APK, presets are files; data-plane damage during the drill is
the drill's own subject (T3 path exercised on purpose). Descope order
(`EXECUTION` Part IV): desktop panel first (the PWA window covers it) —
**never cut:** the wake never-degrades law, the restore drill. If KWGT Pro's
network formulas fail on-device, only the widget's DATA leg dies, and only by
user call; the scheme/tap leg and every wake-surface exit test stand.
