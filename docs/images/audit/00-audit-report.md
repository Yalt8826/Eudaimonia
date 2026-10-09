---
doc: Mockup Vision Audit — 18 generated screens
date: 2026-10-08
method: 3 parallel auditors; pixel-census + OCR + VLM passes (auditor 2/3: colorimetry + OCR, no VLM available)
source: "[[01-design-system]] · prompts/ · images 1–18.png"
---

# Mockup Audit v1 — Aurora law conformance

**Verdict: 10/18 conform. All 8 failures are one class — hue discipline (accent paint on data/text/decoration). Zero layout or feature failures. The dormancy-muted law held on all 3 screens where it was in play; the provenance law (teal=you / violet=agent) held perfectly where core (16 is textbook).**

| # | Screen | Verdict | Issue |
|---|---|---|---|
| 1 | Plaza | ✅ | Dormant NUTRITION line muted-gray, pixel-verified |
| 2 | Wake | ✅ | Full-bleed teal, zero stray state colors |
| 3 | Waiting-on inbox | ✅ | Amber only on the badge, violet only on agent chip |
| 4 | Weekly review | ❌ | Habit-streak dots encode data in teal/amber |
| 5 | Reading queue | ✅ | Amber confined to paused-digest banner |
| 6 | Nutrition | ❌ | Amber food illustrations ~4.5× teal mass; data discipline itself exemplary |
| 7 | Open Questions | ✅ | |
| 8 | Activity timeline | ❌ | Event TEXT tinted per category; spec: muted except dots |
| 9 | Agents | ❌ | One flaw: remediation hint violet inside expanded red row |
| 10 | Server | ❌ | GREEN sparklines (alive-hue falsely state-codes data) + decorative violet |
| 11 | Capture sheet | ✅* | Violet flood beyond chips+SEND (minor) |
| 12 | Notes/Settings | ✅* | Dark-teal SAVE, violet icons on user rows (cosmetic) |
| 13 | Projects | ❌ | Bright amber element inside PARKED column (should be muted) |
| 14 | Goals horizon | ✅ | All three evidence states incl. muted no-status goal |
| 15 | Routine strip | ❌ | Violet glyphs on user rows; skipped row not muted |
| 16 | Agent chat | ✅ | Textbook provenance — strongest screen |
| 17 | Desktop plaza | ✅ | Semantic split holds across dense layout |
| 18 | Widget | ❌ | Widget panel correct; wallpaper is sharp teal clutter |

## Systematic findings
1. **Every failure = hue discipline, not composition.** The generation model reliably
   over-applies accent hue to text/data/decoration. This is exactly the failure class
   the hue-discipline law (in [[01-design-system]]) was written for.
2. **Systematic hex drift:** greens ≈#18C060 (vs #3FB950), ambers ≈#F0A818 (vs #D29922)
   across 13/14/17/18. Impossible in implementation — CSS tokens pin exact hex. The app
   will be *more* lawful than its own mockups.
3. **The critical laws survived:** dormancy-muted (3/3), provenance teal/violet (core screens perfect).

## Re-roll list (optional, gallery-quality only — none block the build)
Amendments that raise success odds: add "sparklines and all data charts MUST be
gray #9BA3AF; NO warm colors anywhere on this screen" to 10/06/08;
"skipped row: all elements at 40% opacity, checkbox muted gray" to 15;
"wallpaper: near-black abstract, ALL icons softly blurred, no teal shapes" to 18;
"streak dots: filled vs outlined white-gray only" to 04.
Priority if re-rolling: 10, 6, 15, 8, 18, 4.

**Build implication: images = direction art. The binding design system is theme.css
tokens; hue misuse is structurally impossible in code (components style against
tokens only). No wholesale regeneration needed.**
