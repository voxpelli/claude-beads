# Backlog Health Heuristics

Reference material for backlog-groomer workflows. See `SKILL.md` for the
workflow steps.

## Staleness Thresholds

A task is **stale** when it meets ALL of these:

- Status is `pending` (not `in_progress`, `completed`, or `cancelled`)
- Not updated in the last 60 days — compare the row's `updated:` field against a
  60-day threshold (grooming default, stricter than the reader's 30-day default
  to reduce noise from recently created items not yet started). The
  `diarie stats --stale` flag (a `stats` flag — `ready` does not accept it, and will
  exit 1) is `in_progress`-scoped, so pending-item
  staleness is read directly from `updated:` in the `.diarie/tasks/*.yml`
- No commits reference the task id in `git log`

Tasks that are `in_progress` but stale (>30 days without activity) may be
abandoned — surface them with `diarie stats --stale --days 30`
and flag separately as "stalled, not stale."

## Closure Criteria

A task is a **closure candidate** when ANY of these apply:

- **Addressed by commit**: a recent `git log` entry mentions the task topic
  or fixes the described problem, but the row was never set to `completed`
- **Superseded**: a newer task covers the same scope with better description
  or broader scope — set the older one to `completed` with a reference to the
  replacement in its `description:`
- **Out of scope**: the project direction has shifted and the task is no longer
  relevant — set `status: cancelled` (user must confirm — never auto-close based
  on scope inference)
- **Stale beyond recovery**: pending >120 days, no activity, `low`/`backlog`
  priority, no blocking relationship — the backlog has moved on

## Duplicate Detection

Duplicates are tasks that describe the same work. The flat-YAML substrate has
**no dedup command** (substrate-not-opinion — no CRUD helper); detection is
manual over the `.diarie/tasks/*.yml` files. Check for:

- **Similar titles**: shared area prefix (`[auth] …`) or shared keywords. Read
  the titles across `.diarie/tasks/*.yml` and scan for near-matches.
- **Shared `labels:`** or references to the same commit/file in `description:`.
  Use `Grep` with keywords from suspicious titles to surface candidates.
- **Cross-status**: a `completed` task may duplicate a `pending` one if the fix
  was incomplete — Grep both statuses, not just open work.

### Resolving duplicates

When merging, prefer the task with more context (longer `description:`, more
`deps:`/`parent:` links). Apply per-pair recommendations by **editing the
loser's row**:

- Set the loser to `status: cancelled` and add `labels: [duplicate]`, then note
  the winner's id in the loser's `description:` (preserves the relationship in
  the YAML — the substrate has no `supersede`/`duplicate` verb).
- If the fix should still ship under the winner, fold any unique
  `acceptance_criteria:` from the loser into the winner before cancelling.

Run `diarie validate` after the edits.

## Priority Assignment Logic

The `priority:` field takes a string from `VALID_PRIORITIES` (default `medium`):

| Priority   | When to assign                                                       |
| ---------- | -------------------------------------------------------------------- |
| `critical` | Blocks all development: broken builds, data loss, security           |
| `high`     | Major feature, important bug, blocks other high-priority work        |
| `medium`   | Default. Nice-to-have feature, non-critical bug, quality improvement |
| `low`      | Polish, optimization, minor friction. No urgency signal              |
| `backlog`  | Future idea, exploration, "someday maybe"                            |

**Reprioritization signals:**

- Task blocks N other tasks → raise priority (blocking power)
- Task has been `backlog` for 3+ sprints with no interest → candidate for closure
- Task aligns with stated sprint goal → raise to `high`/`medium`
- Task conflicts with current direction → lower or close

## Type Assignment Logic

The `type:` field is one of **4 exclusive kinds** (decision `vp-beads-etm`); the
finer bd distinctions ride in `labels:` on a `type: task` row.

| Type        | Where it lives                                   | When to use                                                  |
| ----------- | ------------------------------------------------ | ------------------------------------------------------------ |
| `task`      | a row in `.diarie/tasks/tasks-<slug>.yml`        | Any workable unit — the only type the ready-walker surfaces  |
| `doc`       | frontmatter'd markdown in `.diarie/docs/`        | Reference material; never workable                           |
| `decision`  | frontmatter'd markdown in `.diarie/decisions/`   | Architecture decision record (ADR) — outcome of deliberation |
| `milestone` | a marker row in `.diarie/tasks/tasks-<slug>.yml` | Release boundary or sprint marker — contains no work itself  |

**Framings carried in `labels:` on a `type: task` row** (not distinct types):

| Framing   | Encoding                                                     | When to use                                               |
| --------- | ------------------------------------------------------------ | --------------------------------------------------------- |
| `bug`     | `type: task`, `labels: [bug]`                                | Something broken — unexpected behavior, regression, error |
| `feature` | `type: task`, `labels: [feature]`                            | New system capability (system-centric framing)            |
| `chore`   | `type: task`, `labels: [chore]`                              | Maintenance — dependency updates, CI config, tooling      |
| `story`   | `type: task`, `labels: [story]`                              | User-centric framing of a feature ("As a X, I want Y...") |
| `spike`   | `type: task`, `labels: [spike]`                              | Timeboxed investigation; closes with findings, not code   |
| `epic`    | `type: task`, `labels: [epic]` + children carrying `parent:` | Large body of work that decomposes into child tasks       |

There is **no hard on-create gate** (unlike bd's `validation.on-create=error`):
an entry is workable the moment its required fields (`id`, `title`, `status`,
`type`) are present. `diarie validate` warns (a test-ratchet) when a
**completed** `task` has empty `acceptance_criteria`. The authoritative source
is `diarie/lib/schema.js`.

**Picking between similar framings:**

- plain `task` vs `chore` label — does it change user-visible behavior? Behavior change → plain task; pure maintenance → `labels: [chore]`
- `feature` vs `story` label — system-centric vs user-centric framing of the same change. Both are valid; the distinction is audience
- `epic` label vs `milestone` type — an `epic`-labelled task IS work (decomposes into children via `parent:`); a `milestone` is a marker row (contains no work)
- `spike` label vs `decision` type — a `spike`-labelled task is the investigation; a `decision` file is the recorded outcome. A `spike` task preceding a `decision` file is a common pair

## Issue Title Convention

Format: `[Area] Action verb + subject`

Examples:

- `[auth] Add OAuth2 provider configuration`
- `[db] Fix migration ordering for tenant tables`
- `[ci] Enable shellcheck for hook scripts`
- `[upstream-tracker] Support non-npm tool types`

The area prefix makes tasks scannable in `diarie ready` output.

## Task Description Template

Put this in the row's `description:` block scalar:

```
**Problem:** What is wrong or missing, in 1-2 sentences.

**Why it matters:** Impact on the project or users.

**Suggested first step:** A concrete action to start with.
```

Keep descriptions concise, and state checkable outcomes in
`acceptance_criteria:`. If the task needs extensive context, use workflow 6
(Enrich an existing issue) to add a `## Research Context` section to the
`description:` after creation.

## Creation Limits

- **Per-topic cap**: If research (workflow 4 (Investigate topic as spike)) yields >8 candidate tasks, suggest splitting
  into multiple research sessions or grouping under an `epic`-labelled parent task
- **Per-session cap**: Appending >15 tasks in one grooming session is a signal that
  the topic needs higher-level scoping first (consider an `epic`-labelled parent)
- **Dedup before create**: Always `Grep` the `.diarie/tasks/*.yml` for `<keywords>`
  before appending a task to avoid duplicating existing work
