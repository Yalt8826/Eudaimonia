-- Migration 001 — initial schema (forward-only: there is no down path and
-- none will be built — EXECUTION §2 has no tier for "migrate backward").
-- At this stage rollback is deleting the .db file — nothing in it is real yet.
--
-- Three sections, in order:
--   Section 1 — schema v0.1 FROZEN (02-architecture §3, columns exactly as
--               listed there — v0.1 tables never gain a column in v0.2+ — 02 §6)
--   Section 2 — schema v0.2 ADDITIVE (07-life-layer §19 + 08-agent-console)
--   Section 3 — the shared coverage view (law 7 — its only definition anywhere)
--
-- This file is the single authority for the schema. client/schemas/schema.sql
-- is a byte-exact mirror of the applied migration set (the applied files
-- concatenated in lexicographic order), asserted byte-equal on every CI run.
--
-- Comment discipline for this directory: -- comments only, and never place a
-- quote character or a semicolon inside a comment — the runner splits
-- statements with a quote-aware scanner and this keeps that trivially safe.

-- ===========================================================================
-- Section 1 — schema v0.1 FROZEN (02-architecture §3)
-- ===========================================================================

-- Adapter registry. One row per ingested source.
CREATE TABLE source (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    -- vault globs + cron-output globs as a JSON array (law 2 chain-following)
    globs TEXT NOT NULL,
    class TEXT NOT NULL CHECK (class IN ('behavioral', 'pipeline')),
    -- law 1 (freshness is not success): last_ok_read_ts advances only when an
    -- artifact passes this predicate, never on mtime or file presence
    success_predicate TEXT NOT NULL,
    last_ok_read_ts TEXT,
    status TEXT NOT NULL CHECK (status IN ('alive', 'dead', 'paused')),
    ts TEXT NOT NULL
);

-- The spine. Append-only: corrections are new events, never UPDATE or DELETE
-- (EXECUTION §1). Entity tables are denormalized indexes of the spine.
CREATE TABLE event (
    id INTEGER PRIMARY KEY,
    ts TEXT NOT NULL,                -- ISO8601, content-derived (law 3)
    -- kind is deliberately plain TEXT and must NEVER be "fixed" into a CHECK
    -- or enum: kinds grow additively (habit_tap, routine_done,
    -- goal_status_derived, project_status, agent_chat, ...) and the live
    -- roster is the EXECUTION §7 registry. The frozen enum is origin below.
    kind TEXT NOT NULL,
    origin TEXT NOT NULL CHECK (origin IN ('source-read', 'app-write', 'agent-write')),
    source_id INTEGER REFERENCES source(id),
    external_ref TEXT NOT NULL,      -- path / id / device-uuid:ts, per kind
    actor TEXT NOT NULL,             -- human | system | <profile>
    payload TEXT NOT NULL,           -- JSON text, always valid JSON
    -- Idempotency and provenance each live in exactly this one place (02 §1).
    -- SQLite treats NULLs as distinct inside a UNIQUE constraint, so the
    -- dedupe contract holds when source_id is supplied. source_id stays
    -- nullable only for source-less agent events, which own ref uniqueness.
    UNIQUE (source_id, kind, external_ref)
);

CREATE TABLE loop (
    id INTEGER PRIMARY KEY,
    text TEXT NOT NULL,
    direction TEXT NOT NULL CHECK (direction IN ('owed-by-me', 'owed-to-me')),
    status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'done', 'rolled', 'dropped')),
    ts TEXT NOT NULL
);

CREATE TABLE question (
    id INTEGER PRIMARY KEY,
    text TEXT NOT NULL,
    -- single writer: the agent_invoke event stream (02 §6). Lifecycle
    -- open / picked_up / answered per 08 §20 — v0.1 freezes no CHECK here.
    status TEXT NOT NULL DEFAULT 'open',
    ts TEXT NOT NULL
);

CREATE TABLE reading_item (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'new',  -- new / skimmed / digested / dismissed
    rating INTEGER CHECK (rating IS NULL OR rating BETWEEN 1 AND 5),
    staged_ts TEXT,                      -- ratings stage before prefs write-back
    ts TEXT NOT NULL
);

-- Registry only. A habit tap is not a row here and there is no tap table:
-- taps are event rows of kind habit_tap, payload method tap | recall
-- (02 §3: habit + habit_tap events).
CREATE TABLE habit (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    ts TEXT NOT NULL
);

CREATE TABLE document (
    id INTEGER PRIMARY KEY,
    kind TEXT NOT NULL,                   -- e.g. weekly-review
    week_id TEXT NOT NULL,                -- ISO week, e.g. 2026-W41
    layer TEXT NOT NULL CHECK (layer IN ('mechanical', 'narrated')),
    path TEXT,                            -- export target — the record is the row
    sections TEXT NOT NULL DEFAULT '{}',  -- JSON, section name to content
    ts TEXT NOT NULL,
    -- regeneration is an upsert (09 §1)
    UNIQUE (kind, week_id, layer)
);

CREATE TABLE provenance_edge (
    id INTEGER PRIMARY KEY,
    from_ref TEXT NOT NULL,
    to_ref TEXT NOT NULL,
    type TEXT NOT NULL,                   -- e.g. write-back (law 6)
    ts TEXT NOT NULL
);

-- Dated context. Config never pretends to know causes (02 §3) — a note is
-- quotable for a week iff its validity window intersects it (09 §3 gate 3).
CREATE TABLE context_note (
    id INTEGER PRIMARY KEY,
    text TEXT NOT NULL,
    valid_from TEXT NOT NULL,
    valid_until TEXT                      -- NULL means open-ended
);

-- ===========================================================================
-- Section 2 — schema v0.2 ADDITIVE (07-life-layer §19 + 08-agent-console §21)
--
-- Zero changes to frozen v0.1 tables, and no frozen table ever gains a
-- column (02 §6). project_id / goal_id ride event payloads, never columns
-- (07 §19 amendment (a)).
-- ===========================================================================

CREATE TABLE project (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('active', 'parked', 'done')),
    board_glob TEXT,
    notes_path TEXT,
    ts TEXT NOT NULL
);

CREATE TABLE goal (
    id INTEGER PRIMARY KEY,
    title TEXT NOT NULL,
    target_date TEXT,
    -- SINGLE WRITER: the goal derivation pass (event kind
    -- goal_status_derived, EXECUTION §7) — every transition is an event
    -- first, never a hand edit. Parked stays human-only. Stale evidence
    -- renders "insufficient fresh evidence", never a status (07 §19
    -- amendment (b), 02 §6 single-writer invariant).
    status TEXT NOT NULL CHECK (status IN ('on-track', 'at-risk', 'achieved', 'parked')),
    links TEXT                            -- JSON: related projects / tasks / questions
);

CREATE TABLE assignment (
    id INTEGER PRIMARY KEY,
    profile TEXT NOT NULL,
    text TEXT NOT NULL,
    context_refs TEXT,                    -- JSON: attached context objects
    -- SINGLE WRITER: the agent_invoke lifecycle (event kind
    -- assignment_status, EXECUTION §7) — event-first transitions only.
    -- A timed-out or error-text invocation writes failed, never done
    -- (07 §19 amendment (b), 08 §21, 02 §6: freshness is not success).
    status TEXT NOT NULL DEFAULT 'queued'
        CHECK (status IN ('queued', 'running', 'done', 'failed')),
    origin_object_ref TEXT,
    created_event_id INTEGER REFERENCES event(id),
    result_ref TEXT
);

-- ===========================================================================
-- Section 3 — the shared coverage view (law 7: one shared source)
--
-- This view is the ONLY definition of coverage anywhere in the build (T0.2).
-- Consumers — T1.6 Plaza, T3.4 dormancy engine, T4.1 review coverage block,
-- T6.3 /widgets.json — read it and add nothing to it. The five render states
-- derive from these facts via app/app/coverage.py derive_render_state:
-- alive / dead / paused / behavioral-dormant / uninstrumented.
--
-- Success-artifact contract (law 1: freshness is not success). A successful
-- read artifact is an event row where
--   * origin = source-read
--   * the payload JSON has ok = 1
--   * the payload JSON has content_date = a YYYY-MM-DD string
-- ok = 1 is written only when the source success predicate passed.
-- source.success_predicate documents that predicate in prose.
--
-- days_fresh_7 = COUNT(DISTINCT content_date) over the trailing 7 days
-- (now minus 6 days through today, UTC). Missing days are data, never zeros
-- (law 7): the view returns counts, it never fabricates per-day rows.
-- artifact_count = all-time source-read events for the source (artifacts
-- ingested, passing or not) — zero means no artifact ever (uninstrumented).
-- paused_evidence = 1 iff a job_paused event with actor = human exists for
-- the source (law 5: paused is human-declared, the app never pauses).
--
-- Empty DB: the view queries clean (empty set). A registered source with no
-- events returns honest zeros. Never an error.
-- ===========================================================================

CREATE VIEW coverage AS
SELECT
    s.id AS source_id,
    s.name AS source_name,
    s.class AS class,
    s.status AS status,
    s.last_ok_read_ts AS last_ok_read_ts,
    COUNT(DISTINCT CASE
        WHEN e.origin = 'source-read'
             AND json_extract(e.payload, '$.ok') = 1
             AND json_extract(e.payload, '$.content_date')
                 BETWEEN date('now', '-6 days') AND date('now')
        THEN json_extract(e.payload, '$.content_date')
    END) AS days_fresh_7,
    COUNT(CASE WHEN e.origin = 'source-read' THEN 1 END) AS artifact_count,
    EXISTS (
        SELECT 1
        FROM event p
        WHERE p.source_id = s.id
          AND p.kind = 'job_paused'
          AND p.actor = 'human'
    ) AS paused_evidence
FROM source s
LEFT JOIN event e ON e.source_id = s.id
GROUP BY s.id, s.name, s.class, s.status, s.last_ok_read_ts;
