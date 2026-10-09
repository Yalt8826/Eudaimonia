---
project: Eudaimonia
doc: Agent Console v1.1
owner: praxis
status: added 2026-10-08 (v1.1) — closes agent-chat gap
supersedes: nothing; extends 03/04
---

# Agent Console

Original brief: *"also interact with Hermes and my other agents from the
same app."* v1 docs showed agents **read-only** (agents screen, narrated
markers); this doc adds the **talk-to direction** — you speaking to your
agents from inside Eudaimonia, with provenance, on the one primitive.

## 20. Agent chat (v1.1)

**Does:** per-profile conversation views in-app. You type → the app calls
`agent_invoke(profile, prompt, context)` → the response renders inline,
attributed plum, with a provenance edge to the session log. Context
injection is the killer feature over plain Hermes chat: the app can attach
"current week's mechanical export," "this loop's history," or "the paper
you're triaging" as grounding. Ask clio about week 41 *from the review*;
ask hygeia "what should I eat tonight" *from the meals screen* — the
attachment is the app's advantage, not the transport's.
**Helps:** the hub thesis — Hermes stays the messenger, Eudaimonia becomes
the place where agent attention is *directed with context*.
**Lives:** `/chat` list + `/chat/[profile]` thread; entry points from
review ("ask about this week"), questions screen, capture triage results.

### Honest v1.1 scope limits (stated, not hidden)

- One-shot or short-thread turns through `agent_invoke` — **not** the full
  interactive Hermes session (no tool-loop streaming, no session takeover).
  Long work stays in Hermes/Agora; the console hands off with a link.
- Responses are **agent-write events** — logged, attributed, provenance-
  edged; nothing an agent says in-chat silently mutates app state. If an
  agent proposes a loop resolution, that lands as a *suggestion* requiring
  your tap (human-only actor law, extended).

**Question lifecycle mapping (research seat):** Open Questions rides this
same lifecycle — `picked_up` = invocation opened via `agent_invoke`,
`answered` = success predicate passed + answer document written with its
provenance edge; a timed-out or error-text invocation returns the question
to `open`, never leaves it stuck `picked_up`. Freshness≠success applied to
the question queue; no schema change (`question` is a frozen v0.1 table).
**Writer contract (schema seat):** every `question.status` transition is
written by the invocation event stream (single-writer law) — the
`agent_invoke` chokepoint enforces the timeout itself and therefore
ALWAYS emits a terminal outcome event, even on a crashed run. A process
that dies mid-turn still ends in a recorded failure, which is what flips
the question back to `open`. No other code path may hand-edit status.

## 21. Task assignments (v1.1, replaces the missing "delegate" story)

**Does:** from any question/capture/project detail: "assign to agent" →
creates a tracked assignment (profile, task text, context attachments,
status `queued → running → done/failed`), executed via `agent_invoke`,
results link back to the origin object. The agents screen's invocation
feed already renders these; this adds the *direction* — you initiating.
**Helps:** "agents help me manage all of it" becomes concrete: capture a
messy thought, hand it to noesis to structure; hand zetesis a question
directly instead of waiting for async pickup.
**Lives:** action sheet on questions/captures/project rows; assignments
tab inside `/agents`.

### Screen sketch

```
/chat                        /chat/hygeia
┌──────────────────────┐    ┌──────────────────────────────┐
│ hygeia    ● 2d ago   │    │ ▸ attached: week 41 export   │
│ noesis    ● yesterday│    │ you: protein options tonight?│
│ clio      ● Sunday   │    │ hygeia ◆: paneer 40g… ~est   │
│ zetesis   ● Oct 2    │    │ [attach review] [assign task]│
└──────────────────────┘    └──────────────────────────────┘
                            ◆ plum = agent-write, provenance footer
```

## Schema v0.2 addition

```sql
assignment (id PK, profile, text, context_refs JSON,
            status CHECK(queued|running|done|failed),
            origin_object_ref, created_event_id, result_ref)
-- chat turns = events kind='agent_chat' {profile, direction}, payload text
-- RATIFIED amendment (b, see [[07-life-layer]]): assignment.status transitions
--   are event-first; the row is a cache written only by the agent_invoke
--   lifecycle. timeout / error-text ⇒ failed, never done.
```

## See also

[[03-feature-list]] (features 20–21, summary form) ·
[[04-screens-pwa]] (routes `/chat` `/chat/[profile]`) ·
[[02-architecture]] (law 12: one agent primitive — chat & assignments are consumers) ·
[[07-life-layer]] (projects/questions as assignment origins) ·
[[06-index]] (MOC)

## Laws honored

- One primitive (`agent_invoke`) — chat and assignments are consumers, not
  new transports. Rate limits + audit live in the same place.
- Responses are events; suggestions never auto-mutate; plum everywhere an
  agent spoke; your turns teal. Provenance edge per turn.
- Rate-limit honesty: if invocations are expensive, the console shows your
  own spend count this week — coverage honesty applied to API budget.
