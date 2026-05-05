---
name: synergy-tracker
description: "Manage cross-project synergy tracking between sibling projects. Use when the user wants to log a shared pattern, a divergence, an extraction candidate, or something a sibling project has that this one doesn't. NOT for upstream dependency bugs or vendor friction (use /upstream-tracker for those). Trigger phrases: 'synergy', 'sibling project', 'cross-project', 'extraction candidate', 'compare with [project]', 'both projects do', 'they have X we don't', 'shared pattern', 'divergence', 'cross-project alignment', 'review synergies', 'log this pattern', 'we should extract this', 'they handle this differently', or any mention of patterns, divergences, or shared practices across related projects."
user-invocable: true
argument-hint: "[workflow] [project-name]"
paths:
  - "SYNERGY-*.md"
  - ".claude/synergy-registry.json"
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
  - mcp__basic-memory__search_notes
  - mcp__basic-memory__read_note
  - mcp__basic-memory__edit_note
---

# Synergy Tracker

Manage the `SYNERGY-*.md` files that track shared patterns, divergences,
extraction candidates, and capabilities observed in sibling projects while
building this one. This skill tracks patterns and capabilities across
peer/sibling projects under the same maintainer — not upstream dependency
friction (use `/upstream-tracker` for that).

## Tracking Files

### Sibling projects (permanent files)

Sibling projects are declared in `.claude/synergy-registry.json` (if it exists)
as an array of `{name, file, remote, bm-entity, relationship}` objects. See
`references/synergy-entry-format.md` for the full registry schema.

To discover which projects are registered, read `.claude/synergy-registry.json`
if it exists. If it does not exist, glob for `SYNERGY-*.md` to infer sibling
names from existing files. If neither is present, ask the user which sibling
project is involved before proceeding.

### File naming

Files are named `SYNERGY-<project-name>.md`. The project name is taken from the
`name` field in the registry. For projects outside the registry, derive the name
from the repo slug or directory name: slashes → `--`, drop leading `@`.
Examples: `vp-knowledge` → `SYNERGY-vp-knowledge.md`,
`@scope/shared-utils` → `SYNERGY-scope--shared-utils.md`.

See `references/synergy-entry-format.md` for the full naming convention.

### Lifecycle

SYNERGY files are **permanent** — they always exist for registered sibling
projects, even when all sections are empty. When an entry is resolved or
dismissed, remove it and restore the `_No entries yet._` placeholder for that
section. Do not delete the file.

### Structure

All SYNERGY files use the same four-section structure:

```
## Shared Patterns

_No entries yet._

## Divergences

_No entries yet._

## Extraction Candidates

_No entries yet._

## They Have / We Don't

_No entries yet._
```

Section semantics:

- **Shared Patterns** — practices, conventions, or implementations that exist
  in both projects and should stay aligned
- **Divergences** — places where the two projects intentionally or accidentally
  differ in approach to the same problem
- **Extraction Candidates** — code, patterns, or logic in this project that is
  a strong candidate for extraction into a shared package or library
- **They Have / We Don't** — capabilities in the sibling project that this
  project lacks and may want to adopt. Apply the **domain-fit test** before
  logging:

  > Pass test: "this project has the underlying need but lacks the implementation."
  > Fail test: "the sibling has a capability in a different domain than this project's."

  Without this test, every comparison run produces noise the user must
  dismiss. Worked failures from Sprint 19: vp-beads's `swarm-wave` (sprint
  orchestration is a different domain from vp-claude's research fan-outs)
  and vp-beads's `vendor-sync` (vp-beads vendors content; vp-claude has no
  vendored surface to sync) both passed the surface filter but failed the
  domain-fit test.

## Workflows

Determine which workflow the user needs based on their request. If ambiguous,
default to workflow 1 (log) for "synergy" or "log this" requests, workflow 2
(review) for "review synergies" or "what's open" requests, and workflow 3
(compare) for "compare with" requests.

### 1. Log a synergy entry

When the user observes a shared pattern, a divergence, an extraction candidate,
or a capability gap between this project and a sibling — add it to the correct
file. Infer the details from the current conversation context: what code was
being discussed, what pattern was noticed, what contrast was made.

**Steps:**

1. Identify which sibling project is involved from the conversation context.
   If the user named a sibling project in their request (e.g., "compare with
   vp-knowledge", "log this for vp-knowledge"), use that name directly — do
   not ask again. Otherwise, check `.claude/synergy-registry.json` first. If
   the registry does not identify the sibling, glob for `SYNERGY-*.md` as a
   fallback. If neither resolves it, ask the user.
2. **Basic Memory pre-check.** If Basic Memory MCP tools are available, make
   two `mcp__basic-memory__search_notes` calls: one with the sibling project
   name, one with 2-4 keywords describing the topic being logged (e.g.,
   "PreCompact prompt command hook" or "edit_note append gotcha"). If either
   search returns a matching note with synergy-related or engineering-pattern
   content, surface it to the user: "This pattern is already tracked in Basic
   Memory: \[summary\]. Logging it locally as well so this project tracks it."
   If Basic Memory tools are not available, skip this step silently.
3. If no `SYNERGY-<project>.md` file exists yet, create it from the template
   in `references/synergy-entry-format.md` (four sections with placeholders).
4. Classify the entry into one of the four sections:
   - **Shared Pattern** — the same approach exists in both projects
   - **Divergence** — the projects handle this differently
   - **Extraction Candidate** — this project has something worth extracting
   - **They Have / We Don't** — the sibling has something we lack
5. Read the target `SYNERGY-*.md` file.
6. Compose the entry from this project's perspective using the entry format from
   `references/synergy-entry-format.md`. Focus on impact and adoption cost, not
   implementation internals.
7. Add the entry under the correct section heading, using today's date. When
   adding the first entry to a section, replace the `_No entries yet._`
   placeholder. Keep entries concise — 1-3 sentences. The title should be
   scannable.

**Structured fields** (all optional — omit fields that add no signal):

| Field | Values | Section |
|-------|--------|---------|
| `Status:` | `aligned` · `drifting` | Shared Patterns |
| `Last verified:` | `YYYY-MM-DD` (use today's date for new entries) | Shared Patterns |
| `Convergence path:` | `accept-difference` · `adopt-theirs` · `propose-shared` | Divergences |
| `Readiness:` | `ready` · `needs-cleanup` · `proof-of-concept` | Extraction Candidates |
| `Priority:` | `adopt-soon` · `consider` · `deferred` | They Have / We Don't |
| `Effort:` | `trivial` · `moderate` · `significant` | Extraction Candidates, They Have / We Don't |

See `references/synergy-entry-format.md` for full entry format templates and
field value definitions.

**Bilateral reciprocation mandate.** When the sibling has already written
entries from their side (resolve the sibling path via the registry-with-override
pattern from workflow 3 (Compare with sibling) — `local-path` from the merged
registry, falling back to `../<sibling>/`; check
`<resolved-path>/SYNERGY-<this-project>.md` if the sibling repo is accessible
on disk), reciprocate by re-verifying each
entry from this project's angle, recording your verification dates, and
noting any drift you observe. Do not skip duplicates — the reciprocation IS
the verification step. As captured in BM
`engineering/agents/vp-plugins-vp-beads-and-vp-knowledge`:

> SYNERGY entries describe two parallel implementations that *happen* to be
> aligned, not one shared thing — both sides need their own record so each
> can verify from their POV at their own cadence. "Reciprocation IS the
> verification step."

Sprint 19 evidence: vp-claude reciprocated 9 shared-pattern entries from
vp-beads's `SYNERGY-vp-knowledge.md` to a new `SYNERGY-vp-beads.md`, and the
re-verification surfaced 3 actively drifting artifacts
(`validate-plugin.mjs` 358 vs 333 lines; `scripts/check-hooks.mjs` 366 vs
284 lines; `npm-run-all2` since-converged) plus 1 stale `aligned` row
(PreCompact retired post-v0.28.0 on the vp-claude side). When logging an
entry with no reciprocal yet on the sibling, prompt the user to file the
reciprocal entry on the sibling project (typically a follow-up task in the
sibling repo's bd backlog).

8. **Eager promotion check.** If Basic Memory MCP tools are available, assess
   the project's tempo:

   ```bash
   git rev-list --count --since="90 days ago" HEAD 2>/dev/null
   ```

   Guard: skip if the repo has zero commits total
   (`git log --oneline -1 2>/dev/null` returns empty). Also skip if this is
   the first entry in any SYNERGY file for this project (the user is still
   learning the workflow — promotion is premature).

   | Tempo | Commits in 90 days | Promotion behavior |
   |-------|-------------------|--------------------|
   | **Dormant** | 0–4 | Offer inline promotion for any promotable entry |
   | **Moderate** | 5–14 | Offer only for Extraction Candidates with `Readiness: ready` |
   | **Active** | 15+ | Skip — the normal sprint cadence handles promotion |

   When offering inline promotion, say: "This project has low commit
   frequency — SYNERGY entries can sit unread for months. This entry looks
   promotable to Basic Memory. Want to promote it now?"

   If the user agrees: call `mcp__basic-memory__search_notes` for the sibling
   project name, then `mcp__basic-memory__read_note` to get the exact content,
   then `mcp__basic-memory__edit_note` with `find_replace` to append the
   generalized entry. If no BM note exists for the sibling, flag for enrichment
   instead of creating a thin note.

   For `edit_note` safety: never use `append` with `section` (goes to EOF, not
   section end), always `read_note` before `edit_note`, use
   `expected_replacements=1`. See
   `skills/upstream-tracker/references/basic-memory-friction-format.md` for
   the full gotcha reference.

   If the user declines, or if Basic Memory tools are not available, or if the
   project is active, skip silently.

### 2. Review open synergies

Summarize the current state of all synergy tracking files.

**Steps:**

1. Glob for all `SYNERGY-*.md` files and read them.
2. Present a summary grouped by file, showing counts per section and listing
   each open entry with title and date.
3. Flag stale entries (older than 3 months with no activity). A Trend Review
   entry resets the staleness clock for the entire file.
4. Highlight actionable items:
   - Extraction Candidates with `Readiness: ready` — extractable now
   - Divergences with `Convergence path:` of `adopt-theirs` or `propose-shared`
   - They Have / We Don't with `Priority: adopt-soon`

**Output format:**

```
## Synergy Status

### <project-name>

- Shared Patterns: N (N drifting)
- Divergences: N (N with active convergence path)
- Extraction Candidates: N (N ready)
- They Have / We Don't: N (N adopt-soon)
- [list each entry with title and date]

### Notes

- [stale entries]
- [actionable items]
```

If all files are empty or no SYNERGY files exist, say so and suggest whether a
comparison run (workflow 3 (Compare with sibling)) would be useful — note that it
works best when the sibling repo is accessible on disk at the registry-resolved
path (`local-path` from the merged `.claude/synergy-registry.json` +
`.claude/synergy-registry.local.json`, falling back to `../<project-name>`).

### 3. Compare with sibling

Perform a direct comparison between this project and a named sibling to surface
unlogged synergy observations.

**Steps:**

1. Identify the sibling from the user's request or the `argument-hint` — if
   the user named a project, use that name directly without re-asking. Load
   the registry with override merge:

   1. Read `.claude/synergy-registry.json` for the sibling's `remote` and any
      metadata.
   2. If `.claude/synergy-registry.local.json` exists, read it and merge it on
      top of the base registry. Match entries by the `name` key (the
      human-stable identifier across machines and BM entity paths); for each
      matched entry, fields present in `.local.json` win. Entries in
      `.local.json` with no matching `name` in the base registry are ignored
      (the base registry is the authoritative source of which siblings exist).

   If no project is identified from the argument, merged registry, or existing
   SYNERGY files, ask the user which sibling project to compare with.
2. **Gather sibling context.** Resolve the sibling's local path: prefer the
   `local-path` field on the merged registry entry (relative paths are resolved
   from the current project root); if absent, fall back to `../<project-name>`
   relative to the current project root. If the resolved path is not
   accessible, ask the user for the path (and suggest they record it in
   `.claude/synergy-registry.local.json` to avoid re-prompting). Read the
   sibling's key files if accessible:
   - `package.json` — dependencies, scripts, entry points
   - `CLAUDE.md` — conventions, architecture, workflow documentation
   - Skill files (`Glob` for `skills/**/SKILL.md`) — what skills exist, their
     workflows, trigger phrases
   - Hook definitions (`hooks/hooks.json`) — event handling patterns
   - Agent files (`Glob` for `agents/*.md`) — what agents exist

   If neither local files, conversation context, nor Basic Memory provides
   substantive information about the sibling, stop and tell the user that a
   meaningful comparison requires access to the sibling repo or prior
   knowledge. Do not generate speculative entries.
3. **Diff patterns.** Compare against this project's equivalent files.
   Identify observations in each of the four categories:
   - Shared Patterns: conventions both projects use (same frontmatter fields,
     same BM integration approach, same commit style)
   - Divergences: structural or stylistic differences (different hook handling,
     different reference doc organization, different BM section ownership)
   - Extraction Candidates: logic in this project that would apply to the
     sibling (validation scripts, shared reference formats, utility functions)
   - They Have / We Don't: features or patterns in the sibling absent here
     (agents, skills, hooks, conventions this project lacks)
4. **Propose new entries.** Present each observation as a candidate entry with
   draft text matching the format in `references/synergy-entry-format.md`. For
   each, ask: "Log this as a \[category\] entry for \[sibling\]?" The user
   approves, edits, or skips each candidate. **No mutations without approval.**
5. Log confirmed entries by classifying, reading the file, composing, and
   adding per workflow 1 (Log) steps 4–7. Skip step 8 (eager promotion) for batch
   entries to avoid prompt fatigue. Offer a single summary at the end:
   "N entries logged. Run workflow 2 (Review) to review the full picture."

   If the user skips all candidates, report that no entries were logged and
   suggest whether a follow-up comparison with different focus areas would be
   useful.

### 4. Trend review (quarterly)

Every 4th sprint, perform a cross-cutting analysis of all SYNERGY tracking
files. This cadence aligns with the every-4th-sprint trend review used by
`/retrospective` and `/upstream-tracker` (see CLAUDE.md and MEMORY.md). It
replaces the interim workaround of running workflow 2 (Review) manually at
trend-review boundaries.

**Input signals:**

1. Glob for all `SYNERGY-*.md` files and read them.
2. For each file, count entries per section (Shared Patterns, Divergences,
   Extraction Candidates, They Have / We Don't) and note the date of the last
   Trend Review entry, if any.
3. Compute entry aging from the parenthesized `(YYYY-MM-DD)` on each bullet.
   Flag entries older than 3 months without a follow-up Trend Review note.

**Processing steps:**

1. **Drift audit.** For every Shared Patterns entry marked `Status: aligned`,
   check whether the `Last verified:` date is more than two trend-review cycles
   old (≈8 sprints). Flag stale `aligned` rows — alignment claims decay; the
   Sprint 19 reciprocation pass on `SYNERGY-vp-knowledge.md` surfaced one such
   row (PreCompact retired post-v0.28.0 on the sibling side) that had no way
   to be detected without re-verification.
2. **Reciprocation check.** For each shared-pattern entry, ask whether the
   sibling project has a corresponding entry in its own `SYNERGY-<this>.md`.
   Resolve the sibling path via the registry-with-override pattern from
   workflow 3 (Compare with sibling) — `local-path` on the merged registry
   entry, falling back to `../<project-name>`. Where the resolved path is
   accessible, glob for the reciprocal file and grep for the entry title.
   Asymmetric tracking silently misses drift — see workflow 1 (Log) bilateral
   reciprocation mandate.
3. **Status sweep on Extraction Candidates.** List all Extraction Candidates
   with `Readiness: ready` that have not moved (no annotation, no resolution)
   for more than 2 trend-review cycles (≈8 sprints). These are either
   stalled — escalate to a beads issue — or no longer relevant — recommend
   closing.
4. **They Have / We Don't sweep.** List entries with `Priority: adopt-soon`
   older than one trend-review cycle (≈4 sprints). Either adopt now or
   downgrade to `consider`/`deferred`.
5. **BM cross-reference (planned).** Once workflow 5 (Promote to Basic Memory)
   ships, also cross-reference each open entry against the
   `## Cross-Project Synergy` section of the sibling's BM entity note to
   identify entries already promoted (no need to re-promote) and entries that
   should be promoted now.
6. **Dormancy-aware scaling.** In projects with ≤4 commits in the last 90 days
   (see project tempo in Guidelines), double the staleness thresholds — entries
   in dormant repos age by calendar, not by sprint cadence.
7. Add a per-file Trend Review entry to each SYNERGY file under a
   **Trend Reviews** section. A Trend Review entry resets the staleness clock
   for the entire file (see workflow 2 (Review) staleness rules). If no
   **Trend Reviews** section exists at the bottom of the file, create it
   before adding the entry.
8. Present aggregate findings to the user. Suggest follow-up actions: open
   beads issues for stalled extractions, run workflow 5 (Promote to Basic
   Memory, planned) for promotion candidates once that workflow ships, or
   downgrade stale `adopt-soon` entries.

**Trend Review entry format** (mirrors upstream-tracker workflow 4 (Trend Review)):

```
### Review — YYYY-MM-DD (Sprint N)

- **Themes:** [common patterns across open entries — e.g., recurring drift in
  validation tooling, shared infra still un-extracted]
- **Still valid:** [entries confirmed as still relevant this cycle]
- **Recommend closing:** [entries obsolete, dismissed, or no longer applicable]
- **Escalate:** [stalled Extraction Candidates needing beads issues; stale
  `aligned` rows needing reciprocation refresh; `adopt-soon` items past their
  window]
```

**Output integration with `/retrospective`:** at trend-review sprint boundaries
(every 4th sprint), `/retrospective` chains into this workflow's per-file
review entries and includes a "Synergy trend review" subsection summarizing
themes and escalations across all SYNERGY files.

## Sprint Workflow Integration

synergy-tracker runs as a parallel track to upstream-tracker at sprint
boundaries:

- **Sprint end:** sprint-review agent globs `SYNERGY-*.md` alongside
  `UPSTREAM-*.md` and reports extraction candidates. `/retrospective` includes
  a "Synergy observations" section.
- **Sprint start:** session-start hook emits a dormancy nudge for SYNERGY files
  in low-activity repos.

Workflow 5 (Promote to Basic Memory) is planned. Until it ships, workflow 4
(Trend Review) handles staleness and surfaces promotion candidates without
writing to BM; users promote selected entries manually via
`mcp__basic-memory__edit_note`.

## Guidelines

- **Consumer perspective.** Write entries from this project's point of view.
  Focus on impact: "We can't reuse the validation logic without copying it"
  rather than "The validation function in vp-knowledge is not exported."
- **Scope boundary with upstream-tracker.** Package-specific friction always
  goes to upstream-tracker, even if discovered via sibling comparison.
  synergy-tracker tracks patterns, practices, and capabilities — not bugs or
  API issues in shared dependencies.
- **Registry awareness.** Always check `.claude/synergy-registry.json` before
  globbing for `SYNERGY-*.md`. The registry is the authoritative source for
  sibling project metadata.
- **No thin BM notes.** Never create a Basic Memory note for a sibling project
  as a side effect of promotion. If no note exists, flag for enrichment and
  stop.
- **Stale threshold.** Individual entries are stale after 3 months without
  activity. A Trend Review entry resets the staleness clock for the entire file.
- **No auto-mutations.** Every proposed entry requires explicit user approval
  before being logged. Never write to SYNERGY files or Basic Memory without
  confirmation.
- **Division of labor.** synergy-tracker owns `## Cross-Project Synergy` in
  sibling project entity notes in Basic Memory (future workflow 5 (Promote to Basic Memory)). upstream-tracker
  owns `## Upstream Friction` in npm/tool entity notes. retrospective owns
  `engineering/*` notes. These three sections never overlap.
- **Project tempo classification.** Measure with
  `git rev-list --count --since="90 days ago" HEAD 2>/dev/null`: **dormant**
  (0–4 commits), **moderate** (5–14), **active** (15+). Dormant and moderate
  repos get earlier promotion nudges at workflow 1 (Log) time.
- **Design rationale: why cross-project tracking lives in Basic Memory, not bd.**
  The bd v1.0.0 Integration Charter (`gastownhall/beads@5d524cf7:docs/INTEGRATION_CHARTER.md`)
  establishes a "no cross-tracker orchestration" rule — bd will never grow a
  feature that routes a synergy item from project A's bd to project B's bd.
  synergy-tracker's `SYNERGY-*.md` files plus the `## Cross-Project Synergy` BM
  section (workflow 5 (Promote to Basic Memory), planned) are exactly the
  workflow-automation layer the Charter punts to external tools.
