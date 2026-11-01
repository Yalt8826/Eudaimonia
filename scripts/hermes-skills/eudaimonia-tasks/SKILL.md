---
name: eudaimonia-tasks
description: "Run Yashas's study plan in the Eudaimonia phone app: write the Week Plan it shows, and read/change each task's next-session notes, subtasks and timed sessions (GRE, dMAT, Deep Learning, ...)."
version: 0.2.0
author: Eudaimonia
platforms: [linux]
metadata:
  hermes:
    tags: [Eudaimonia, Tasks, Planning, Study, Week-Plan, Productivity]
    related_skills: [weekly-review-planning, obsidian]
---

# Eudaimonia: the plan and the task threads

Eudaimonia is the user's phone app. Its server runs on THIS machine (olympus)
at `http://127.0.0.1:8000`. The app's home screen ("Plaza") shows **Today's
Plan**, a card listing the day's time blocks. Tapping a block opens that
block's **task page**: a session timer, notes for next time, a subtask
checklist and the session history.

You own two things here:

1. **The Week Plan**, the vault file the card is built from.
2. **The task threads**, the per-subject notes and subtasks the phone and you
   both read and write.

## When to use

- "Plan next week" / "move GRE to the morning" / "add a reading block"
- "What did I do on GRE last time?" / "What's left for Deep Learning?"
- "Add 'redo quant set 2' to GRE" / "Remind me next session to start with ex 3.4"
- "Tick off / remove the backprop subtask" / "Log 40 minutes of reading"
- The weekly review (pair with `weekly-review-planning`): read each task's
  history and open subtasks before writing next week's plan.

## 1. The Week Plan (what the card shows)

File: `/srv/data/vaults/main/Noesis/Week Plan.md`. It is a rolling file: you
overwrite it each week, and the app keeps every revision it has read.

The app parses it strictly. Keep this shape exactly:

```markdown
# Week Plan — 2–8 Nov 2026

> one-line description (optional)

## Daily backbone (Mon–Sat)
| Time | Block | Notes |
|------|-------|-------|
| 3:00–3:45pm | **dMAT** (45m) | Warm-up — keeps the exam fresh |
| 3:45–6:45pm | **GRE deep work** (~3h) | Quant + verbal |
| 11:15pm–12:30am | **Flex slot** | Project / review / rest |

## Weekly targets
| Track | This week | Longer view |
|-------|-----------|-------------|
| **GRE** | Target weak quant topics | Oct/Nov exam |
| **Deep Learning** | ~1.25h/day | Part I by 15 Nov |
```

Rules the parser enforces:

- **Header.** `# Week Plan — <range> <Month> <Year>`, using either form:
  `2–8 Nov 2026` or `30 Nov–6 Dec 2026`. Month names are 3 letters. If the
  header doesn't parse, the app ignores the whole file.
- **Only table rows count**, and only the rows after a table's `|---|` line.
  Prose and bullet lists, including "Day by day", are not shown in the app.
  Keep them for the user's own reading if you like.
- **Time blocks.** The first cell is a time range: `3:00–3:45pm`, `9–10am` or
  `11:15pm–12:30am`. Put am/pm at least on the end time. Rows are listed in
  time order, and one after midnight is still that day.
- **Targets.** Any table row whose first cell is NOT a time range is a weekly
  target. Its first cell (e.g. `**GRE**`) is the **subject name**. Bold is fine
  because the app strips `**`.
- The app marks the block happening now from the phone's clock, so you never
  write "now" or "done" into the file.

**After every edit you must refresh the app.** Nothing re-reads the file on
its own:

```bash
curl -s -X POST http://127.0.0.1:8000/api/ingest/run
curl -s http://127.0.0.1:8000/api/plan/today   # verify: week_start + plan_lines are the new ones
```

If `plan_today` still shows the old `week_start`, the header didn't parse. Fix
the header and run ingest again.

## 2. Subjects: how blocks map to task threads

Every block belongs to a **subject**, and notes and subtasks hang off the
subject rather than the block. That way, Tuesday's note waits for Wednesday's
session and carries into next week's plan.

- A block whose title contains a target name belongs to that target:
  "GRE deep work (~3h)" belongs to **GRE**, and "Deep Learning (~1.25h)"
  belongs to **Deep Learning**.
- Any other block's subject is its title without the duration:
  "Gym (2h)" becomes **Gym**.
- Subjects match case-insensitively.

**So keep target names stable week to week.** Renaming "Deep Learning" to
"DL book" starts an empty thread. If a block should share a thread, include
the target's exact name in its title.

## 3. The task API

All writes take `"actor": "noesis"`, so the phone shows "via noesis" on
them. URL-encode subjects that contain spaces (`Deep%20Learning`).

```bash
# every subject with notes, subtasks or time logged
curl -s http://127.0.0.1:8000/api/tasks

# one subject: next notes, subtasks (with ids), running timer, history, minutes
curl -s http://127.0.0.1:8000/api/tasks/GRE

# add a subtask (type "subtask") or a note for next session (type "next")
curl -s -X POST http://127.0.0.1:8000/api/tasks/GRE/items \
  -H 'content-type: application/json' \
  -d '{"type":"subtask","text":"redo quant set 2","actor":"noesis"}'

# tick (done:true) / untick (done:false) a subtask, or dismiss a next note
curl -s -X POST http://127.0.0.1:8000/api/tasks/items/<item_id>/check \
  -H 'content-type: application/json' -d '{"done":true,"actor":"noesis"}'

# remove an item
curl -s -X POST http://127.0.0.1:8000/api/tasks/items/<item_id>/remove \
  -H 'content-type: application/json' -d '{"actor":"noesis"}'

# log work done after the fact (minutes optional, 1-960)
curl -s -X POST http://127.0.0.1:8000/api/tasks/Deep%20Learning/logs \
  -H 'content-type: application/json' \
  -d '{"text":"read ch 2, did ex 2.1-2.4","minutes":40,"actor":"noesis"}'
```

What the fields mean:

- **`next`**: notes for the next session, pinned at the top of the task page
  until the user taps "done".
- **`subtasks`**: the checklist. Unticked items carry over.
- **`history`**: timed sessions from the phone (minutes, plus the user's "what
  I got done" note) and logs. `capped: true` means a timer was left running,
  so treat those minutes as unreliable.
- **`running`**: a session is in progress right now. Don't log over it.

## Rules

- Read before you write. Get item ids from `GET /api/tasks/<subject>`, and
  never guess an id.
- The user's own items have `actor: "human"`. Ask before removing or ticking
  them.
- The phone is local-first. A change the user made offline appears here only
  after their phone syncs, so a missing item may just not have arrived yet.
- A `422` means the payload was rejected. Report it, and don't retry the same
  payload.
- When you plan a week, use the history. Open subtasks and the last session's
  note are the best input for what each block should cover next.

## This skill is managed for you

This file is installed from the Eudaimonia repo, and **every deploy
overwrites it**. Don't edit it with `skill_manage`, because your edits will
be lost. Record what you learn about working with the user (their preferences,
how they like plans laid out, recurring subtasks) in your own companion skill
instead:

- Create it once: `skill_manage(action="create", name="eudaimonia-noesis-notes", category="productivity", content=<SKILL.md>)`.
- Give it frontmatter with `name`, a one-line `description`, and
  `related_skills: [eudaimonia-tasks]`.
- Extend it later with `skill_manage(action="patch", ...)`. Keep it about
  procedures and preferences, not a diary.
- Never put secrets in it.

If this skill itself is wrong (the API changed, or a rule above fails in
practice), tell the user, so it gets fixed in the repo.
