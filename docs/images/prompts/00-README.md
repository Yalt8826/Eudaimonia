---
project: Eudaimonia
doc: Image-prompt library — one prompt per screen
owner: clio
status: v2 "Matte & Torn" (2026-10-08) — re-skinned from 01-design-system v2; v1 archive preserved
source: "[[01-design-system]] · [[04-screens-pwa]] · [[05-screens-desktop-widgets]] · [[07-life-layer]] · [[08-agent-console]]"
---

# Image Prompts — Eudaimonia screens

One self-contained prompt per screen image. Every prompt embeds the full
**Matte & Torn style block** (matte black `#0B0B0C` + static grain ·
teal `#2DD4BF` = you act · deep plum `#B872F2` = agents act · torn-paper
sections under the black skin, ragged dark-fringed edges, flat no-blur ·
glass bubbles/buttons · state colors green/red/amber · warm dark ink on
paper · IBM Plex) because image models have no shared context — each
file stands alone.

| File | Screen | Route | Client | Aspect |
|---|---|---|---|---|
| `01-plaza-phone.md` | Plaza — Today view (home) | `/` | phone PWA | 9:19.5 |
| `02-wake-screen.md` | Wake screen (hard-mode) | `/habits/wake` | phone PWA | 9:19.5 |
| `03-waiting-on-inbox.md` | Waiting-on inbox | `/inbox` | phone PWA | 9:19.5 |
| `04-weekly-review.md` | Weekly review — paper tier | `/week/[iso]` | phone PWA | 9:19.5 |
| `05-reading-queue.md` | Reading triage queue | `/reading` | phone PWA | 9:19.5 |
| `06-nutrition-meals.md` | Nutrition detail | `/meals` | phone PWA | 9:19.5 |
| `07-open-questions.md` | Open Questions | `/questions` | phone PWA | 9:19.5 |
| `08-activity-timeline.md` | Activity timeline | `/timeline` | phone PWA | 9:19.5 |
| `09-agents-screen.md` | Agents screen | `/agents` | phone PWA | 9:19.5 |
| `10-server-screen.md` | Server screen | `/server` | phone PWA | 9:19.5 |
| `11-capture-sheet.md` | Capture compose sheet | `/capture` | phone PWA | 9:19.5 |
| `12-notes-settings.md` | Notes & settings | `/notes · /settings` | phone PWA | 9:19.5 |
| `13-projects-board.md` | Projects board | `/projects` | phone PWA | 9:19.5 |
| `14-goals-horizon.md` | Goals horizon | `/goals` | phone PWA | 9:19.5 |
| `15-routine-strip.md` | Routine day detail | `/routine` | phone PWA | 9:19.5 |
| `16-agent-chat.md` | Agent chat console | `/chat/[profile]` | phone PWA | 9:19.5 |
| `17-plaza-desktop.md` | Plaza — desktop wide | `/ (≥1024px)` | PC (installed PWA) | 16:9 |
| `18-android-widget.md` | Android home-screen widget (KWGT) | `home screen widget` | Android (KWGT) | 9:19.5 phone wallpaper |

## Usage notes

1. **Paste the whole prompt** from a file's `## Prompt` section — nothing
   else needed.
2. **Set the aspect ratio** in your model to match the table (phone:
   9:19.5 or the closest supported, e.g. 9:16–9:21; desktop: 16:9).
3. **Text will be garbled** — image models mangle long strings. Expect
   wrong numerals and pseudo-words; judge composition, color roles, and
   hierarchy, then regenerate. These are mood/layout references; the
   binding spec remains the design docs above.
4. **Consistency trick:** generate all screens in one model session and
   keep every prompt's style block intact — that is what makes the set
   look like one app.
5. Regenerating a palette (all six ship in the picker) = swap the accent
   hexes in the style block; the layout descriptions never change.
