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
  project lacks and may want to adopt

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
comparison run (workflow 3, compare with sibling) would be useful — note that it
works best when the
sibling repo is accessible at `../<project-name>` on disk.

### 3. Compare with sibling

Perform a direct comparison between this project and a named sibling to surface
unlogged synergy observations.

**Steps:**

1. Identify the sibling from the user's request or the `argument-hint` — if
   the user named a project, use that name directly without re-asking. Read
   `.claude/synergy-registry.json` for the sibling's `remote` and any metadata.
   If no project is identified from the argument, registry, or existing SYNERGY
   files, ask the user which sibling project to compare with.
2. **Gather sibling context.** To find the sibling repo on disk, check
   `../<project-name>` relative to the current project root. If not found, ask
   the user for the path. Read the sibling's key files if accessible:
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
   adding per workflow 1 steps 4–7. Skip step 8 (eager promotion) for batch
   entries to avoid prompt fatigue. Offer a single summary at the end:
   "N entries logged. Run workflow 2 to review the full picture."

   If the user skips all candidates, report that no entries were logged and
   suggest whether a follow-up comparison with different focus areas would be
   useful.

## Sprint Workflow Integration

synergy-tracker runs as a parallel track to upstream-tracker at sprint
boundaries:

- **Sprint end:** sprint-review agent globs `SYNERGY-*.md` alongside
  `UPSTREAM-*.md` and reports extraction candidates. `/retrospective` includes
  a "Synergy observations" section.
- **Sprint start:** session-start hook emits a dormancy nudge for SYNERGY files
  in low-activity repos.

Workflows 4 (trend review) and 5 (promote to Basic Memory) are planned for
v0.10.0. Until then, run workflow 2 (review) at every trend-review sprint
boundary (every 4th sprint) to manually assess staleness and promotion
candidates.

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
  sibling project entity notes in Basic Memory (future W5). upstream-tracker
  owns `## Upstream Friction` in npm/tool entity notes. retrospective owns
  `engineering/*` notes. These three sections never overlap.
- **Project tempo classification.** Measure with
  `git rev-list --count --since="90 days ago" HEAD 2>/dev/null`: **dormant**
  (0–4 commits), **moderate** (5–14), **active** (15+). Dormant and moderate
  repos get earlier promotion nudges at workflow 1 time.
