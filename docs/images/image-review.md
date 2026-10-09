---
project: Eudaimonia
doc: Generated-image review — 18 screens vs the design laws
owner: clio
status: review complete 2026-10-08; images = visual north-star, docs = binding spec
source: "[[01-design-system]] · prompts in this folder"
---

# Image Review Scorecard

Verdict: **the set works as a design reference — 13 clean passes, 1 partial
(below-fold content only), 4 need a regen with amended prompts if used for
visual QA.** Text quality is exceptional: almost zero garbling across 18
generations (real labels, correct numerals). Color grammar is ~90% law-true.

| Img | Screen | Verdict | Notes |
|---|---|---|---|
| 1 | Plaza | ⚠ fix | Best-composed of the set. Violation: violet hourglass on WAITING ON (human items — violet=agents only). Everything else exemplary: gray dormancy dot, amber badge only on digest line, violet only on "narrated by Noesis". |
| 2 | Wake | ✅ pass | Full-bleed teal, one target, zero chrome. The hard-mode law, visualized. |
| 3 | Inbox | ✅ pass | Violet only on the agent-source chip (correct semantics), amber badge the only warning, done/roll/drop rendered. Active-tab teal is ratified (01 token table). |
| 4 | Weekly review | ✅ pass | Paper tier lands — serif, no blur, violet rule on narrated paragraph, all numbers neutral. Nits for the build: narrated copy says "streak" (banned word for the narrated voice); amber dot on a partial habit window (borderline behavioral coloring). |
| 5 | Reading | ✅ pass | Amber confined to banner; violet confined to agent summary; one garbled glyph ("⊂"), cosmetic. |
| 6 | Nutrition | ✅ pass | Dormancy dot neutral gray, values hue-free, protein bold, tildes everywhere. Content nit: invented logged days contradict the dormancy badge (generator invention — ignore). |
| 7 | Questions | ✅ pass | Violet owns the lifecycle, green only on answered, provenance footers rendered. |
| 8 | Timeline | ✅ pass | Semantic dots only; invented-but-consistent amber SYSTEM category. |
| 9 | Agents | ⚠ fix | Dots + remediation hint correct — but a **"Fix now →" button** violates the read-only v0 law (no action buttons on agents screen; the app never fixes). Regen with amendment. |
| 10 | Server | ✅ pass* | Row sparklines muted ✓, no buttons ✓. Borderline: KPI hero sparklines teal (data in accent hue). Amendment written; regen optional. |
| 11 | Capture | ✅ pass | Sheet over scrim, violet chips + send, one-handed geometry. |
| 12 | Notes/Settings | ✅ pass | Note card + teal SAVE clean; settings swatches below fold (uncritical). |
| 13 | Projects | ⚠ fix | Parked-muted is perfect. Violations: violet on column "+" buttons (decorative violet), health % in teal (status in accent), amber flag dot on a card (hand-colored status — the exact thing we banned). Regen with amendment. |
| 14 | Goals | ✅ pass | Serif document feel, green on-track / amber at-risk, no red, evidence lines. Third evidence-gap branch below fold. |
| 15 | Routine | ✅ pass | Checkbox states + "2 of 4" chip correct; skip row below fold. Zero guilt styling visible. |
| 16 | Chat | ✅ pass | Provenance rendered: teal yours / violet agent, attachment chip, "~est" marker, source footer. |
| 17 | Desktop | ⚠ fix | Visible portion strong (incl. muted skipped row). Violations: violet wordmark/sparkle/category icons (decorative violet), amber dots on waiting rows. Right column unverifiable (crop). Regen with amendment. |
| 18 | Widget | ✅ pass | True glass read, all rows, sync-age line, restrained. |

## Rule for use

Images are the **visual north-star** for P0's shell and screen builds; the
docs remain the binding spec wherever they disagree (crops, invented
content, and the ⚠ items above). Amended prompts are marked in the prompt
files — regeneration is optional and only needed if these images become
pixel QA references.
