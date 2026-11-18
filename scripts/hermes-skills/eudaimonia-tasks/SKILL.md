---
name: eudaimonia-tasks
description: "Read and change Yashas's per-task notes, subtasks and study sessions in the Eudaimonia app (the Today's Plan tasks: GRE, dMAT, Deep Learning, ...)."
version: 0.1.0
author: Eudaimonia
platforms: [linux]
metadata:
  hermes:
    tags: [Eudaimonia, Tasks, Planning, Study, Productivity]
---

# Eudaimonia task notes

The Eudaimonia phone app shows Today's Plan; each block (e.g. "GRE deep work")
belongs to a **task subject** ("GRE"). Every subject has one running thread:

- **next** notes — "for next session" reminders, shown pinned until dismissed
- **subtasks** — a checklist; unticked items carry over between sessions
- **sessions** — timed work sessions (started/stopped on the phone) and logs

Whatever you write here appears on the phone immediately (and the phone's
writes appear here). Subjects match case-insensitively. Use the week plan's
target names as subjects: GRE, dMAT, Deep Learning, Market Momentum, Kerdos —
or a block title without its duration ("Gym", "Flex slot").

## When to use

- "What did I do on GRE last time?" / "What's left for Deep Learning?"
- "Add 'redo quant set 2' to GRE" / "Remind me next session to start with ex 3.4"
- "Tick off / remove the backprop subtask"
- "Log that I read chapter 2 for 40 minutes"

## API (on olympus — the server listens on localhost)

Base: `http://127.0.0.1:8000`. Always pass `"actor": "<your profile name>"` on
writes so the phone shows who added it. URL-encode subjects with spaces
(`Deep%20Learning`).

```bash
# everything with notes/subtasks/time on it
curl -s http://127.0.0.1:8000/api/tasks

# one task: next notes, subtasks (with ids), running timer, history
curl -s http://127.0.0.1:8000/api/tasks/GRE

# add a subtask (type "subtask") or a next-session note (type "next")
curl -s -X POST http://127.0.0.1:8000/api/tasks/GRE/items \
  -H 'content-type: application/json' \
  -d '{"type":"subtask","text":"redo quant set 2","actor":"noesis"}'

# tick (done:true) / untick (done:false) a subtask, or dismiss a next note
curl -s -X POST http://127.0.0.1:8000/api/tasks/items/<item_id>/check \
  -H 'content-type: application/json' -d '{"done":true,"actor":"noesis"}'

# remove an item entirely
curl -s -X POST http://127.0.0.1:8000/api/tasks/items/<item_id>/remove \
  -H 'content-type: application/json' -d '{"actor":"noesis"}'

# log work done (minutes optional, 1-960)
curl -s -X POST http://127.0.0.1:8000/api/tasks/Deep%20Learning/logs \
  -H 'content-type: application/json' \
  -d '{"text":"read ch 2, did ex 2.1-2.4","minutes":40,"actor":"noesis"}'
```

## Rules

- Read the task first (`GET /api/tasks/<subject>`) to get item ids before
  checking or removing; never guess ids.
- Confirm before removing items the user wrote themselves (actor "human").
- A 422 means the payload was rejected — report it, do not retry blindly.
- Timed sessions are started/stopped on the phone; use logs to record work
  after the fact.
