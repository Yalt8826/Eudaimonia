# Phase P4.5 — Agent console: chat + assignments

**Size S · ~4–6 nights · Entry: P4 exit · Rollback: T1 (client) / T2 (API)**

> **What the phase proves:** you can direct agent attention from inside
> the app, with context attached and provenance recorded — and nothing an
> agent says can change app state on its own.

This is the slot `02 §3` already named: *"agent console + assignments =
P4.5 (post-narrated-pass, same `agent_invoke` budget)"*. It arrives after
P4 for a reason — the narrated pass is the first real consumer of the
chokepoint at scale, and its gates, failure paths and spend profile are
known before a chat surface multiplies invocations.

**Ships:** `/chat` profile list + `/chat/[profile]` thread with context
attachment · `assignment` lifecycle and the assignments tab on `/agents`
(the slot T4.4 deliberately left empty) · the spend line that makes
invocation cost visible.

**Exit tests:**

1. **A chat turn round-trips with its context attachment and a resolvable
   provenance edge** — asked from the review, the week's mechanical
   export is what the agent received.
2. **An agent proposal never mutates state** — a suggestion requiring
   your tap is the only path from agent speech to app state (08 §20).
3. **A killed invocation leaves an assignment `failed`, never `done`**
   (02 §6; 07 §19 amendment (b)).

**Descope order:** the spend line → context attachment beyond the current
screen's object (one attachment is the feature; five are a preference
panel). **Never cut:** suggestions-require-a-tap, and the single-writer
assignment cache — they are the phase's reason to exist.

**Read before starting:** `08-agent-console.md` IN FULL — this phase is
its implementation · `02-architecture.md` §2 law 12 (one primitive), §6
(single-writer statuses; failure never reads as success) · `07-life-layer.md`
§19 amendment (b) · `04-screens-pwa.md` `/chat` · `01-design-system.md`
§4 (plum = agents act, teal = you) · `EXECUTION.md` §7 (event-kind
registry) and §4 (standing greps).

**Standing greps on every task here:** every agent call through
`agent_invoke` (law 12) · one `backdrop-filter` per route · accent hexes
only in `theme.css` · no frozen-table columns · no second writer of any
status cache.

---

## Task graph

```
P4 exit
   │
T45.1 agent chat (/chat, /chat/[profile]) ──── T45.2 assignments
          ~2–3 nights                              ~2–3 nights
                                                      │
                                              P4.5 exit — two-pass
```

Serial: assignments reuse the chat turn's context-attachment and
attribution rendering. Both are consumers of the one primitive — neither
adds a transport (law 12).

---

### T45.1 — Agent chat: `/chat` + `/chat/[profile]`

**Reads:** 08 §20 (chat; the honest scope limits; question-lifecycle
mapping) · 02 §2 law 12 · 02 §6 (chokepoint terminal outcomes) · 04
`/chat` · 01 §4 (hue law) · EXECUTION §7 (`agent_chat`)
**Depends on:** P4 exit
**Parallel with:** —
**Tier:** T1 (client) / T2 (API)

**Build**

`/chat` lists one row per Hermes profile — **glob-enumerated, never
hardcoded** (profiles come and go; same rule as T4.4's agents screen) —
with its last-turn time. `/chat/[profile]` is the thread.

**[impl] One-shot turns through `agent_invoke`, and the limits are
stated** (08 §20). A turn is `agent_invoke(profile, prompt, timeout,
success_predicate)` — **not** an interactive Hermes session: no tool-loop
streaming, no session takeover. Long work stays in Hermes/Agora and the
console hands off with a link. Writing this limit into the UI copy is
part of the task, not a README footnote.

**[impl] Context attachment is the whole advantage over plain Hermes
chat** (08 §20). Entry points carry their object: from `/week/[iso]`,
"ask about this week" attaches the mechanical export; from `/meals`, the
day's rows; from `/reading`, the paper; from a capture-triage result, the
capture. The attachment renders as a plum-outlined chip on the turn, and
the prompt the agent received is **recoverable from the event payload** —
an attachment you cannot reconstruct is not provenance.

**[impl] Turns are events; nothing in chat mutates state** (08 §20;
02 §6). Each turn is an `agent_chat` event — `{profile, direction}` in
the payload, origin `app-write` for yours and `agent-write` for the
agent's — plus a provenance edge to the session log. **If an agent
proposes a state change (resolve this loop, close that question), it
lands as a suggestion requiring your tap**, never an applied write. The
suggestion's acceptance is an ordinary app-write event with actor=human,
and the proposal event stays on the spine either way.

**[impl] Rendering** (01 §4): **your turns teal, agent turns plum**
(`--accent-2` on glass, `--accent-2-ink` on paper), provenance footer per
agent turn, attachment chips plum-outlined. Estimates inside an agent
answer keep their `~` (law 11) — the chat surface does not launder an
estimate into prose.

**[impl] Spend visibility** (08 "Laws honored", rate-limit honesty):
the thread header carries your invocation count this week, from the
spine's `agent_invoke_result` rows — coverage honesty applied to the API
budget. It is a count, never a warning; no quota UI, no nagging.

**Tests** — `app/tests/consoles/test_chat.py` + `client/src/routes/chat.test.tsx`

- A turn emits one `agent_chat` app-write (yours) and one agent-write
  (the reply), both provenance-edged; the prompt sent is reconstructible
  from the payload
- Profiles are glob-enumerated: a fixture profile added at runtime
  appears without a code change; a removed one stops listing
- **Context attachment:** a turn opened from the week screen receives the
  mechanical export — asserted on what the invocation was handed, not on
  the UI chip
- **A proposal that would mutate state renders as a suggestion and
  changes nothing until a human tap** — assert zero state change on the
  proposal event alone (the 08 §20 contract)
- Killed invocation mid-turn → terminal failure event, the thread renders
  the failure, **no agent turn is fabricated** (02 §6)
- Hue assert: agent turns carry plum tokens, yours teal; no state hue
  appears in a thread
- Spend line equals a hand-counted `agent_invoke_result` fixture
- Grep: no hermes/subprocess outside `agent_invoke`

**Done when**
- [ ] A real turn to a real profile round-trips, attributed plum, with a
      resolvable provenance edge
- [ ] Context attachment proven on what the agent received
- [ ] A proposal requiring a tap changes nothing until tapped
- [ ] Killed invocation renders a failure, never a fabricated reply

**If it fails**
If a turn hangs, the chokepoint's timeout is doing its job — the defect
is predicate or profile, as in T0.3. If an agent reply appears after a
recorded failure, two code paths are writing turns: there is exactly one
(the invocation stream). Never add a chat-local retry or watchdog — retry
and limits live in `agent_invoke` and only there (law 12).

**Commits**
`chore(T45.1): start agent-chat — baseline green` →
`feat(T45.1): /chat threads on agent_invoke, context attachment, suggestions-require-a-tap`

---

### T45.2 — Task assignments + the assignments tab

**Reads:** 08 §21 (assignments) · 07 §19 amendment (b) (status cache,
one writer, timeout ⇒ failed) · 02 §6 (single-writer; failure never reads
as success) · 04 `/agents` · T4.4 (the tab slot it fills) · EXECUTION §7
(`assignment_status`)
**Depends on:** T45.1 (context attachment + attribution rendering)
**Parallel with:** —
**Tier:** T1 (client) / T2 (API)

**Build**

An "assign to agent" action sheet on **question / capture / project**
rows (08 §21), and the assignments tab inside `/agents` — the slot T4.4
left empty on purpose.

**[impl] The `assignment` row is a cache with exactly one writer.** The
table exists from migration 001 (T0.2 Section 2: profile, text,
`context_refs` JSON, status CHECK `queued|running|done|failed`,
`origin_object_ref`, `created_event_id`, `result_ref`). Every transition
emits an `assignment_status` event **first**; the row follows (07 §19
amendment (b); 02 §6). The `agent_invoke` lifecycle is that writer and
nothing else may write the field — no status editor, no admin endpoint,
no "mark done" button.

**[impl] Timeout or error-text ⇒ `failed`, never `done`** (02 §6;
07 §19 (b)). The chokepoint already guarantees exactly one terminal
outcome even on a mid-crash (T0.3), so a `queued`/`running` assignment
that never resolves is a **chokepoint defect by construction** — the same
contract T2.5 relies on for questions. Results link back to the origin
object by `origin_object_ref`, with a provenance edge from the result to
the assignment's creating event.

**[impl] The invocation feed is already free** (law 12): T4.4's agents
screen renders spine events, so assignments appear there the moment they
emit. This task adds the *direction* — you initiating — not a second
feed. Statuses render through the spine's state pairs:
queued/running amber → teal → green, with plum attribution on the agent's
result (01 §4; 06 colour row).

**Tests** — `app/tests/consoles/test_assignments.py` + `client/src/routes/agents.test.tsx`

- Assign from a question, a capture and a project: each creates one
  assignment with its `origin_object_ref`, and the result links back
- Every transition emits `assignment_status` before the row changes;
  replaying the spine re-derives every status exactly (EXECUTION §1)
- **Kill hermes mid-run → terminal failure → status `failed`**; no path
  writes `done` from a failed invocation (02 §6)
- An assignment never sticks in `running`: the chokepoint's terminal
  event always resolves it (the T0.3/T2.5 contract, re-asserted here)
- Repo gate: a direct `assignment.status` write outside the invocation
  stream is rejected; grep finds no second writer
- The tab renders from the cache with correct state dots; plum only on
  agent results

**Done when**
- [ ] Assign → run → result links back to its origin object with
      provenance
- [ ] A killed invocation lands `failed`, never `done`, never stuck
- [ ] One writer proven by grep + repo gate; statuses re-derive from the
      spine

**If it fails**
A stuck `running` assignment is the chokepoint's timeout not firing —
fix it in `agent_invoke` (law 12), never with an assignment-local
watchdog, which would be a second writer and is forbidden. If a result
lands without linking back, `origin_object_ref` was dropped at creation:
the link is minted when the assignment is created, never inferred later.

**Commits**
`chore(T45.2): start assignments — baseline green` →
`feat(T45.2): assignment lifecycle on the single-writer invocation stream`

---

## Phase exit (two-pass, EXECUTION §5)

- [ ] A chat turn round-trips with its context attachment, attributed
      plum, provenance edge resolving
- [ ] An agent proposal changes nothing without a human tap
- [ ] A killed invocation leaves `failed` — never `done`, never stuck
- [ ] `assignment.status` and every chat turn have exactly one writer
      (grep + repo gate)
- [ ] Spend line matches a hand-counted invocation fixture
- [ ] Standing greps green across the phase diff (law 12, blur, accent
      hexes, frozen columns)
- [ ] Exit claims re-verified by a second pass — different grep, different
      seat, or a cold re-read the next day (02 §6)

**Rollback:** T1 (client) / T2 (API). Chat turns and assignment
transitions are spine events: a wrong one is superseded by a compensating
event, never deleted (EXECUTION §1). No vault writes exist in this phase.
