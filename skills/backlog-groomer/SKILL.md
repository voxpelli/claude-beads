---
name: backlog-groomer
description: "Manage the flat-YAML task backlog for this project. Use when the user wants to review or triage open issues, reprioritize the backlog, identify obsolete issues to close, investigate a topic to inform future work, create new issues from research findings, or enrich an existing issue with external context. Trigger phrases: 'groom', 'triage', 'backlog review', 'reprioritize', 'stale issues', 'what should we close', 'too many issues', 'backlog health', 'investigate for backlog', 'research and create issues', 'add context to issue', 'enrich issue', 'plan the work for', 'break down into issues', 'start the sprint', 'plan the sprint', 'plan next sprint', 'what should we work on', 'find duplicates', 'dedup backlog', 'near-duplicates', or any request to audit, prune, or research work tracked in the flat-YAML tracker."
argument-hint: "[topic]"
user-invocable: true
paths:
  - ".diarie/tasks/**"
  - "RETRO-*.md"
  - "UPSTREAM-*.md"
  - "SYNERGY-*.md"
allowed-tools:
  - Bash
  - Read
  - Edit
  - Write
  - Glob
  - Grep
  - mcp__basic-memory__search_notes
  - mcp__basic-memory__read_note
  - mcp__tavily__tavily_search
  - mcp__tavily__tavily_extract
  - mcp__deepwiki__ask_question
  - mcp__raindrop__find_bookmarks
  - mcp__raindrop__fetch_bookmark_content
---

# Backlog Groomer

Triage, prioritize, and research work tracked in the flat-YAML task substrate
(`.diarie/tasks/tasks-<slug>.yml`). This skill reads the store via
`diarie ready` (the files-native `bd ready`) and mutates it
with plain Edit/Write on the YAML — there is **no CRUD helper**
(substrate-not-opinion). All mutations (append a task, set `status: completed`,
edit a row) require explicit user approval before execution, and every YAML edit
is validated with `diarie validate`.

Determine which workflow the user needs based on their request. If ambiguous,
default to workflow 1 (review and triage) for grooming requests, or workflow 4
(Investigate topic as spike) for research requests.

## Task Types Reference

The flat-YAML substrate has **4 exclusive types** (decision `vp-beads-etm`):
`task` (work), `doc` (reference), `decision` (record), `milestone` (marker). Pick
the type that matches the *shape* of the item; the finer bd framings (`bug`,
`feature`, `chore`, `story`, `spike`, `epic`) are **not types** — they ride along
in `labels:` on a `type: task` entry.

| Type        | Where it lives                                   | When to use                                                  |
| ----------- | ------------------------------------------------ | ------------------------------------------------------------ |
| `task`      | a row in `.diarie/tasks/tasks-<slug>.yml`        | Any workable unit — the only type the ready-walker surfaces  |
| `doc`       | frontmatter'd markdown in `.diarie/docs/`        | Reference material; never workable                           |
| `decision`  | frontmatter'd markdown in `.diarie/decisions/`   | Architecture decision record (ADR) — outcome of deliberation |
| `milestone` | a marker row in `.diarie/tasks/tasks-<slug>.yml` | Release boundary or set marker; contains no work itself      |

**Framings carried as `labels:` on a `type: task` row** (not distinct types):

| Framing   | Encoding                                                     | When to use                                                     |
| --------- | ------------------------------------------------------------ | --------------------------------------------------------------- |
| `bug`     | `type: task`, `labels: [bug]`                                | Defect — behavior diverges from intended                        |
| `feature` | `type: task`, `labels: [feature]`                            | New system capability (system-centric framing)                  |
| `chore`   | `type: task`, `labels: [chore]`                              | Maintenance / housekeeping with no user-visible behavior change |
| `story`   | `type: task`, `labels: [story]`                              | User-centric framing of a feature ("As a X, I want Y...")       |
| `spike`   | `type: task`, `labels: [spike]`                              | Timeboxed investigation; closes with findings, not code         |
| `epic`    | `type: task`, `labels: [epic]` + children carrying `parent:` | Large body of work that decomposes into child tasks             |

**Authoritative source:** `scripts/task-schema.mjs` (the single canonical
schema). There is **no hard on-create gate** — unlike bd's
`validation.on-create=error`, an entry is a workable unit the moment its required
fields (`id`, `title`, `status`, `type`) are present. `diarie validate`
warns (a test-ratchet) when a **completed** `task` has no `acceptance_criteria`;
it never blocks creation.

Type-pair conventions worth knowing: a `spike`-labelled task precedes a `story`
or a `decision` (investigation precedes commitment); an `epic`-labelled task
parents its `story`/`task` children via `parent:`; a `milestone` marks a release
boundary over a set of related tasks.

## Grooming Workflows

### 1. Review and triage

Scan the open backlog for issues that need attention: stale items, potential
duplicates, blocked chains, and missing context.

**Steps:**

1. Run `diarie ready` for the ready queue and read every
   `.diarie/tasks/*.yml` (Glob + Read) for the full open picture. Parse
   `diarie ready --json` for the `{ready, blocked,
   needsAttention}` buckets, and `diarie ready --filter
   in_progress` for claimed work. Run `diarie stats`
   for summary counts.

2. Run `diarie stats --stale --days 60` to flag stalled work.
   Note the reader's `--stale` is `in_progress`-scoped (a claimed task not
   updated in N days = "stalled"). For **pending** items aging without activity,
   compare each row's `updated:` field (Read the `.diarie/tasks/*.yml`) against
   the 60-day threshold — there is no reader flag for pending staleness.

3. Detect duplicates manually — there is no dedup command in the flat-YAML
   substrate. Read titles and `labels:` across `.diarie/tasks/*.yml` and use
   `Grep` with keywords from suspicious titles to surface near-matches (same
   area prefix, shared keywords, references to the same commit/file). Present
   each candidate pair with a merge or supersede recommendation: resolve by
   editing the loser's row to `status: cancelled` and adding a `labels: [duplicate]` plus a note in its `description:` referencing the winner's id
   (preserves the relationship in the YAML). Apply only with explicit per-pair
   user approval.

4. Run `diarie ready --blocked` to identify tasks stuck on
   unresolved dependencies (each line names its blocker ids).

5. Cross-reference with `UPSTREAM-*.md` and `SYNERGY-*.md` files if they exist
   (use `Glob` to find them). Note any UPSTREAM friction or SYNERGY extraction
   candidates that should have a corresponding task entry.

6. If Basic Memory MCP tools are available, call
   `mcp__basic-memory__search_notes` for key dependencies from `package.json`
   to surface known friction not yet in the backlog. Skip silently if
   unavailable.

7. Present a structured triage table:

   ```
   | ID | Title | Age | Priority | Flags |
   |----|-------|-----|----------|-------|
   | vp-beads-xxx | ... | 45d | low | stale, missing description |
   ```

8. Suggest per-item actions: close (set `status: completed`/`cancelled`),
   reprioritize, merge with duplicate, refine scope, or leave as-is. **No
   mutations without explicit per-item approval.**

### 2. Reprioritize

Propose a priority reordering based on current sprint goals and blocking
relationships.

**Steps:**

1. Ask the user for current sprint goals if not obvious from conversation
   context. Infer from recent commits and `diarie ready --filter in_progress` if the user does not state goals explicitly.
2. Read every `.diarie/tasks/*.yml` (Glob + Read) to get all open items with
   their current `priority:` values.
3. Run `diarie ready --blocked` to identify blocked chains.
   Trace `parent:` and `deps:` in the YAML to visualize blocking power — tasks
   that unblock the most downstream work should rank higher.
4. Propose a reordered priority list with reasoning per change. Present as a
   diff: current priority → proposed priority, with a one-line rationale.
5. User approves, edits, or rejects each proposed change.
6. Edit the row's `priority:` field per approved change (one of `critical`,
   `high`, `medium`, `low`, `backlog`), then run `diarie validate`.

### 3. Suggest closures

Identify issues that are likely obsolete and propose closing them.

**Steps:**

1. Read every `.diarie/tasks/*.yml` (Glob + Read), focusing on `low`/`backlog`
   items and rows whose `updated:` is older than 60 days.
2. Cross-reference `git log --oneline -50` with task titles — use `Grep` to
   match task keywords against commit messages. Find tasks already addressed
   by commits but never formally closed.
3. Grep the `.diarie/tasks/*.yml` for `status: completed` entries that supersede
   open ones.
4. Run `diarie stats --stale --days 90` for deeply stalled
   `in_progress` items; for pending items, compare `updated:` against 90 days.
5. Classify each closure candidate:
   - **Addressed by commit**: cite the commit
   - **Superseded**: cite the replacement task
   - **Out of scope**: note the scope shift (user must confirm)
   - **Stale beyond recovery**: >120 days, no activity, low priority
6. Present candidates with rationale per item.
7. Per approved closure, edit the row to `status: completed` (or `cancelled` for
   out-of-scope work); record the closure rationale in the commit message (the
   YAML has no `reason` field). Run `diarie validate` after editing.

See `references/backlog-health-heuristics.md` for closure criteria and
staleness thresholds.

## Research Workflows

### 4. Investigate topic as spike

*(formerly: investigate-topic)*

Research a topic to inform future work — a timeboxed investigation that
reduces uncertainty before committing to a story or decision. When the
investigation is itself worth tracking (e.g. multi-session research), the
result is a `spike`-labelled `type: task` capturing its goal and findings in
`description:`. When the investigation immediately produces actionable items,
hand off to workflow 5 (Create issues from findings) which will create the
appropriate downstream entries (`story`/`feature`-labelled tasks, plain tasks,
a `decision` file, etc.).

Takes a topic from the user's request or the `argument-hint`.

**Steps:**

1. Parse the user's topic. Classify: technology/library question, project
   refactor, or feature request. This guides the research tool mix.
2. **Basic Memory search first** (non-negotiable). Call
   `mcp__basic-memory__search_notes` for the topic and related terms. For
   relevant matches, call `mcp__basic-memory__read_note` to get full content —
   surface existing engineering notes, package notes, or upstream friction
   entries. If Basic Memory is unavailable, note the gap and proceed.
3. Check existing tasks: `Grep` the `.diarie/tasks/*.yml` for `<keywords>` to
   find overlap with already-tracked work.
4. Scan the codebase: use Glob and Grep for existing code related to the topic.
   Understand the current state — what exists, what patterns are established.
5. Check Raindrop bookmarks: call `mcp__raindrop__find_bookmarks` with topic
   keywords to surface previously bookmarked articles and resources. If
   relevant bookmarks are found, use `mcp__raindrop__fetch_bookmark_content`
   to extract key insights. Skip silently if unavailable.
6. External research (if needed based on classification):
   - `mcp__deepwiki__ask_question` for package/framework architecture questions
   - `mcp__tavily__tavily_search` for broader implementation patterns
   - `mcp__tavily__tavily_extract` for deep-diving specific URLs found in search
     If external tools are unavailable, proceed with what is available.
7. Synthesize into a concise brief: what exists now, what needs to change, key
   technical decisions, known pitfalls. Cap at 4-6 bullet points.
8. Flag items that should become issues (hand off to workflow 5 (Create issues from findings)) or enrich an
   existing issue (hand off to workflow 6 (Enrich an existing issue)).

### 5. Create issues from findings

Turn research findings into structured task entries. Takes output from
workflow 4 (Investigate topic as spike) or user-provided findings.

**Steps:**

1. Review the findings and identify discrete, actionable items. Each task
   should be completable in roughly one session of focused work.
2. Dedup check: `Grep` the `.diarie/tasks/*.yml` for `<keywords>` from each
   proposed title against existing tasks. Surface near-matches for the user to
   review.
3. Propose structured entries. For each:
   - **Title**: `[Area] Action verb + subject` convention
   - **Type + framing**: `type:` is one of the 4 kinds (`task`, `doc`,
     `decision`, `milestone`); the bd framings (`bug`, `feature`, `chore`,
     `story`, `spike`, `epic`) ride in `labels:` on a `type: task` row. See the
     **Task Types Reference** above; consult
     `references/backlog-health-heuristics.md` for assignment logic
   - **Priority**: one of `critical`, `high`, `medium`, `low`, `backlog` with
     explicit reasoning
   - **Body**: put the problem + why it matters + suggested first step in the
     row's `description:` block scalar, and any checkable outcomes in
     `acceptance_criteria:`. There is no hard on-create gate — but
     `diarie validate` warns if a *completed* task has empty
     `acceptance_criteria`, so state done-ness up front
4. If >3 related tasks emerge from one topic: propose a parent task
   (`type: task`, `labels: [epic]`) as a group container, with child tasks
   carrying `parent: <parent-id>`. Use a `type: milestone` marker row instead
   if the parent represents a release boundary with no decomposition of its own.
5. If the investigation itself yielded enough output to warrant a record but
   not yet enough to commit to downstream work, create a `spike`-labelled
   `type: task` capturing its goal and findings in `description:` rather than
   forcing premature `story`/`feature`-labelled tasks.
6. If >8 tasks from one topic: suggest splitting into multiple research
   sessions rather than creating a sprawling epic.
7. User approves, edits, or rejects each proposed entry before any Edit/Write
   runs. Present the full list first, then confirm.
8. Per approved entry, **append a task entry** to the right
   `.diarie/tasks/tasks-<slug>.yml` via Edit/Write — `id:` / `title:` /
   `status: pending` / `type: task` (or `milestone`) / `priority:` / optional
   `labels:` / `deps:` / `parent:` / `acceptance_criteria:`. A `decision` is not
   a row — write it as frontmatter'd markdown at `.diarie/decisions/<id>.md`
   (a `doc` at `.diarie/docs/<id>.md`). Run `diarie validate` after the
   edits.
9. Add dependencies where natural ordering exists: edit the child's `deps: [<parent-id>]` for a blocks-relationship, or set `parent: <parent-id>` for
   parent-child nesting. Common patterns: a `spike`-labelled task before a
   `story`-labelled one or a `decision`; `story → task`; an `epic`-labelled
   parent over its children.
10. Report: created ids, the dependency graph, and the suggested first task to
    start — run `diarie ready` to confirm which is ready
    (highest priority with no unsatisfied dependencies).

See `references/backlog-health-heuristics.md` for title conventions, description
templates, and creation limits.

### 6. Enrich an existing issue

Add research context to an existing issue that needs more information before
work can begin.

**Steps:**

1. User identifies the task by id or title. Read its entry in the relevant
   `.diarie/tasks/tasks-<slug>.yml` to read the current state (title,
   description, status, priority, deps, parent).
2. Research the topic using the same pipeline as workflow 4 (Investigate
   topic as spike): Basic Memory search → Raindrop bookmarks → codebase
   scan → external research (DeepWiki, Tavily) as needed.
3. Draft an enriched body. Preserve the existing `description:` and append a
   `## Research Context` heading within it (the `description:` block scalar
   holds prose) with findings, relevant links, and suggested approach; add any
   new checkable outcomes to `acceptance_criteria:`.
4. Show the draft to the user for approval before applying.
5. Edit the row's `description:` (and `acceptance_criteria:`) with the enriched
   content after approval, then run `diarie validate`.

## Guidelines

- **User approval is non-negotiable.** Every write operation (appending a task
  entry, setting `status: completed`/`cancelled`, editing a row's `priority:` or
  `description:`) must be explicitly approved per item. Present candidates first,
  confirm, then execute the Edit/Write. Never auto-mutate.
- **Validate every edit.** Run `diarie validate` after any change to a
  `.diarie/tasks/*.yml` file (or a `.diarie/decisions/*.md` / `.diarie/docs/*.md`
  write) — it is the integrity gate, replacing bd's on-create validation.
- **Tracker available (Tier B).** The flat-YAML tracker is available iff a
  `.diarie/tasks/tasks-*.yml` file exists **and** the `diarie` CLI is runnable; a
  missing store is an **error** (`ENOSTORE`, non-zero exit), never an empty backlog.
  This component is **Tier B** per CLAUDE.md `### Files-availability convention`.

  **Empty and absent are different, and you must branch on which one you got:**

  - **Store present, no open work** — `diarie ready --json` exits 0 with
    `{"ready": [], ...}`. That is a real answer: the backlog exists and is clear.
    Groom normally (there may still be `blocked`, `needsAttention`, or closed rows).
  - **Store absent** — `diarie` exits non-zero with `{"code": "ENOSTORE"}` on stdout.
    **Do not report this as an empty backlog.** This project keeps its work somewhere
    else. Redirect: for the planning / sprint triggers in this skill's description
    ("plan the sprint", "what should we work on", "break down into issues") against a
    `ROADMAP.md` or manual list, use `/swarm-wave` — it plans waves from either. Do
    not attempt to groom a `ROADMAP.md` here.

  Always pass `--json` and never pipe stderr to `/dev/null`, or ENOSTORE becomes
  indistinguishable from silence and the branch above cannot be taken.
- **Basic Memory is opportunistic.** Check for BM tool availability and skip
  silently if unavailable. BM enriches grooming with cross-project context but
  is not required for the core workflows.
- **Infer from context.** When the user asks to groom or research, read the
  conversation history for recent friction, decisions, and goals rather than
  starting a Q\&A. The user should not have to re-explain context.
- **Keep output scannable.** Use tables for triage results, diffs for priority
  changes, numbered lists for task proposals. Cap output at what fits in a
  conversation turn.
- **Respect the priority vocabulary.** Use the string scale consistently:
  `critical`, `high`, `medium`, `low`, `backlog` (default `medium`).
