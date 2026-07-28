---
name: retrospective
description: "Run a sprint retrospective for this project. Use when the user says 'retrospective', 'retro', 'close out the sprint', 'what went well', 'generate retro', or wants to generate a RETRO-NN.md file. Reads UPSTREAM-*.md files, recent git history, and conversation context to pre-populate the retrospective. Do NOT generate a RETRO-NN.md for a quick sprint summary — the user closes sprints directly. Only run when explicitly asked for a retrospective."
user-invocable: true
paths:
  - "RETRO-*.md"
  - "UPSTREAM-*.md"
  - "SYNERGY-*.md"
allowed-tools:
  - Read
  - Edit
  - Write
  - Glob
  - Grep
  - Bash
  - Skill
  - mcp__basic-memory__search_notes
  - mcp__basic-memory__read_note
  - mcp__basic-memory__write_note
  - mcp__basic-memory__edit_note
  - mcp__basic-memory__schema_validate
  - mcp__basic-memory__schema_diff
  - mcp__basic-memory__schema_infer
---

# Sprint Retrospective

Generate a sprint retrospective for this project. If the project `CLAUDE.md` has
a Sprint retrospectives section with a template, use it; otherwise use the
template below.

## Context

Retrospective files are named `RETRO-NN.md` in the project root. Each covers one
sprint's worth of work.

## Workflow

### Tracker availability

The flat-YAML tracker is available iff a `.diarie/tasks/tasks-*.yml` file exists
**and** the `diarie` CLI is runnable; a missing store is an **error** (`ENOSTORE`,
non-zero exit), never an empty backlog. This component is **Tier C** per CLAUDE.md
`### Files-availability convention`. Steps 1–3 and the UPSTREAM / SYNERGY /
Basic Memory parts of the trend review are tracker-independent and run unchanged.
When the tracker is **unavailable**, the three tracker-dependent steps **degrade
and announce** (never skip silently):

* **Health audit (step 4)** — replace the tracker health checks with an announced
  skip line in the RETRO `### Health audit` subsection (see step 4).
* **Findings (step 5)** — append a `### Follow-ups (untracked)` task list to the
  RETRO file instead of appending task entries to
  `.diarie/tasks/tasks-<slug>.yml` (see step 5).
* **Decision capture (step 5)** — record decisions inline as a `### Decisions`
  block in the RETRO file instead of writing a `.diarie/decisions/<id>.md`
  file (see step 5).

`diarie` is resolved the same way the hooks resolve it: on `PATH` if installed, else the
project's `node_modules/.bin/diarie`. It is an external dependency (its own repo, published to npm
as `diarie@0.2.0`), consumed here as a `^0.2.0` dependency.

### 1. Determine sprint number

```bash
ls RETRO-*.md | sort -V | tail -1
```

Extract the highest sprint number and increment by 1.

**This file count is canonical for the trend-review heuristic in step 4** —
do not substitute a user-asserted topic number, release number, or tracker
sprint label. If `RETRO-NN.md` count is divisible by 4, this IS a
trend-review sprint regardless of how the work is verbally framed.

### 2. Gather context

Run these in parallel:

**Recent commits since last retro:**

```bash
# An EMPTY anchor makes the range ""..HEAD, which git resolves to ZERO commits —
# not full history. The two empty-anchor cases are distinct and need opposite
# handling, so branch on WHY the anchor is empty.
anchor=$(git log -1 --format=%H -- 'RETRO-*.md')
prev_retro=$(ls RETRO-*.md 2>/dev/null | sort -V | tail -1)

if [ -n "$anchor" ]; then
  # RETRO files are tracked — anchor on the previous one.
  git log --oneline "$anchor"..HEAD --no-merges
elif [ -z "$prev_retro" ]; then
  # Genuine first retrospective — full history is correct.
  git log --oneline --no-merges
else
  # RETRO files exist but are gitignored: git has no RETRO anchor. Prefer the
  # last release tag (platform-native, convention-independent); else fall back
  # to the previous RETRO file's mtime.
  tag=$(git describe --tags --abbrev=0 2>/dev/null)
  if [ -n "$tag" ]; then
    git log --oneline "$tag"..HEAD --no-merges
  else
    git log --oneline --no-merges --since="$(date -r "$prev_retro" '+%Y-%m-%d %H:%M:%S')"
  fi
fi
```

Anchor on the last **tag**, not on a commit-subject grep. `git log -1 --grep='^feat: v[0-9]'` looks correct but returns the most recent commit _matching the pattern_ — when a project's release-commit convention drifts (here, `feat: vN.N.N —` → `chore(release): vN.N.N`), the grep keeps succeeding against an ancient commit and silently reports a range several sprints too wide. A tag lookup fails loudly instead.

**Announce a degraded commit range.** When the gitignored branch runs, tell the
user which anchor was used (release commit or file mtime) — the range is a
heuristic, not an exact sprint boundary. The mtime fallback fails entirely on a
fresh clone with no local RETRO history; say so rather than reporting an empty
sprint. Silently emitting zero commits is the bug this branch exists to prevent.

**Current upstream status:**

* Glob for all `UPSTREAM-*.md` files and read them
* Count open items per file and per section

**Current synergy status:**

* Glob for all `SYNERGY-*.md` files and read them
* Count open entries per file and per section
* Highlight actionable items: Extraction Candidates with `Readiness: ready`,
  Divergences with `Convergence path: adopt-theirs` or `propose-shared`,
  They Have / We Don't with `Priority: adopt-soon`
* Note any Shared Patterns with `Status: drifting`

**Recent conversation context:**

* Review the current session for friction, workarounds, discoveries, and
  decisions made during development

**Test and coverage status:**

Check `package.json` scripts for a test command. Try in order:

1. `npm test` (if a `test` script exists)
2. `npm run test:node` (if a `test:node` script exists)
3. `npm run test` (if a `test` script exists under another variant)
4. `npm run check` (if a `check` script exists — used by validation-suite projects like this one, vp-knowledge, vp-git)

Run the first that exists and show the last 5 lines of output.

### 3. Draft the retrospective

Create `RETRO-{N}.md` using this template (omit `### Synergy observations`
if no SYNERGY-\*.md files were found in step 2):

```markdown
## Sprint {N} Retrospective — {YYYY-MM-DD}

### What went well

- ...

### What could improve

- ...

### Upstream observations

<!-- Review recent work — anything to add to UPSTREAM-*.md files? -->

- ...

### Synergy observations

<!-- From SYNERGY-*.md: extraction-ready candidates first, then drifting
     patterns, then active convergence paths. Omit if no SYNERGY files. -->

- **Extraction Candidates ready:** <!-- e.g. "validate-helpers (vp-knowledge) — Readiness: ready" or "none" -->
- **Drifting shared patterns:** <!-- e.g. "BM note format — drifting since 2026-01" or "none" -->
- **Active convergence paths:** <!-- e.g. "error handling — adopt-theirs from vp-knowledge" or "none" -->
- **New patterns logged this sprint:** <!-- e.g. "Logged 2 new Extraction Candidates" or "none" -->
- **Stale entries flagged:** <!-- entries >3 months old, or "none" -->

### Lessons learned

- ...
```

**Section guidelines:**

* **What went well** — concrete wins: bugs caught, patterns established, clean
  commits, test improvements. Reference specific files/commits. Focus on process
  and engineering quality, not just features shipped.
* **What could improve** — honest assessment of friction, false starts, wasted
  effort. Not a blame list — focus on systemic issues and what would prevent
  recurrence.
* **Upstream observations** — summarize current state of all UPSTREAM files.
  Log any NEW friction discovered in the session to the appropriate UPSTREAM
  file using `/upstream-tracker` workflow 1 (Log a new entry). Review recent
  session work — did any workarounds or local extensions get built this sprint
  that are self-contained enough to contribute back? If yes, log via
  `/upstream-tracker` workflow 1 (Log a new entry) with type "Upstream
  Opportunity". Note trends across packages.
  Flag stale items (>3 months old).
* **Synergy observations** — summarize current state of all SYNERGY files.
  Log any NEW cross-project observations discovered in the session to the
  appropriate SYNERGY file using `/synergy-tracker` workflow 1 (Log a synergy
  entry). Report
  extraction candidates with `Readiness: ready` as sprint-actionable. If any
  candidates were acted on this sprint, record the outcome. Review recent
  session work — did any implementation reveal shared patterns with sibling
  projects, or produce logic worth extracting into a shared package? If yes,
  log via `/synergy-tracker` workflow 1 (Log a synergy entry). Note trends across sibling projects.
  Flag stale entries (>3 months old). If no SYNERGY files exist, omit this
  section from the generated RETRO-NN.md entirely.
* **Lessons learned** — reusable insights. Each should be a principle that
  future sessions can apply, not a one-off fact. Format: **Bold principle** —
  supporting evidence from this sprint.

### 4. Check for trend review

If this is every 4th sprint (Sprint 4, 8, 12, ...), also perform a trend review:
(Sprint number is the file count from step 1, not a topic-asserted number.)

**UPSTREAM files:** Review all `UPSTREAM-*.md` files — identify common trends,
evaluate whether open items are still valid, delete non-vendor files with no
remaining entries.

**SYNERGY files:** Review all `SYNERGY-*.md` files — identify stale entries
(>3 months), evaluate whether Shared Patterns are still `aligned` or have
drifted, check if Extraction Candidates with `Readiness: ready` have been acted
on, and review whether `adopt-theirs` Divergences have been adopted.

**Tracker health:** Run the flat-YAML tracker's health vocabulary —
`diarie validate` (integrity gate) plus `diarie stats` /
`--stale` / `--blocked` (counts, lifecycle, and blocked review). Surface
counts plus the top 3–5 affected items per check in the generated
`RETRO-NN.md` under a `### Health audit` subsection.

**Tracker unavailable (Tier C):** skip the tracker health checks and render the
subsection as a single announced line instead — `- _Skipped — flat-YAML tracker
not active in this project._` The UPSTREAM and SYNERGY trend-review parts above
and the Basic Memory graph health below are tracker-independent and still run.

```bash
diarie validate                    # Integrity: schema/dep-graph/reference integrity across tasks-*.yml
diarie stats      # Counts: total / pending / in_progress / completed / ready / blocked
diarie stats --stale --days 30  # Lifecycle: tasks with no recent activity
diarie ready --blocked    # Blocked review: tasks whose deps are unmet
```

Per-check guidance:

* **`diarie validate`** — the integrity gate. It validates each task row
  against `diarie/lib/schema.js`, checks the dependency graph for cycles and
  dangling `deps:`/`parent:` refs, and reports rows missing required fields. No
  auto-fix — findings require human triage; list the affected task IDs with the
  failing field or dangling ref so the maintainer can edit the YAML directly.
  Break a dependency cycle or drop a stale reference by editing the offending
  row's `deps:`/`parent:` list (substrate-not-opinion — plain Edit/Write on the
  YAML, no CRUD helper).
* **`diarie stats --stale --days 30`** — lifecycle. No auto-fix; suggest one of three human
  actions per task: **defer** (`status: deferred` — consciously postponed, still open),
  **drop** (`status: cancelled` — won't do), or **work** (claim it: `status: in_progress` +
  `agent:`). There is no `closed` status; the vocabulary is
  `pending | in_progress | completed | failed | cancelled | deferred`, and `cancelled`
  ("won't do") is deliberately distinct from `completed` ("done").
* **`diarie ready --blocked`** — blocked review. A blocked row carries **`blockers`** (deps
  that must FINISH FIRST) and/or **`children`** (it is a container — an epic — and the work
  is in its children). **They are not the same finding and must not be reported as one:** a
  container blocked by its own open children is an epic in flight, which is healthy and not a
  grooming signal. For a _dep_-blocked task, flag any blocker already `completed` — that row
  is unblocked but not actioned, and needs a re-run of `diarie ready` to re-evaluate readiness
  (readiness
  is recomputed on every walk, never stored), or the row's `deps:` edited to drop
  the satisfied blocker.

Render in the RETRO file as:

```markdown
### Health audit

- **Integrity (`diarie validate`):** {N} findings — {top items, or "clean"}
- **Lifecycle (`diarie stats --stale --days 30`):** {N} stale tasks — {top items, or "clean"}
- **Stats (`diarie stats`):** {total / pending / in_progress / completed / ready / blocked counts}
- **Blocked review (`diarie ready --blocked`):** {list blocked tasks; for each, flag any blocker whose status is currently `completed` — edit the row's `deps:` and re-run `diarie ready` to re-evaluate readiness}
```

**Basic Memory graph health** (via Basic Memory MCP tools):

1. Run the knowledge-gardener agent for automated audit (orphans, schema, stale notes, duplicates)
2. Validate both schemas: call `mcp__basic-memory__schema_validate` with `note_type="npm_package"` and again with `note_type="engineering"`
3. Call `mcp__basic-memory__schema_diff` on both types to detect drift (new observation categories in use but not in schema, or schema fields rarely used)
4. If notes cluster around a new unschemaed `type`, call `mcp__basic-memory__schema_infer` and consider creating a new schema
5. Verify all notes have: frontmatter `type` and `tags`, `## Observations`, `## Relations`
6. Flag notes missing any layer; fix or file tracker tasks (append to
   `.diarie/tasks/tasks-<slug>.yml` per step 5, or the `### Follow-ups
   (untracked)` RETRO block when the tracker is unavailable)

**Basic Memory notes (project-independent knowledge base):** Basic Memory is a
cross-project knowledge store — notes there must be written from a general
engineering perspective, not referencing project-specific file paths, table names,
or project structure. Vendor package names (e.g., `@scope/vendor-package`) are
fine since they're real npm packages. Mentioning this project by name is okay
when genuinely relevant — just don't make notes only useful within this project.
Call `mcp__basic-memory__search_notes` and:

* Update notes that have been superseded by new learnings this sprint
* Remove notes that are too project-specific — generalize or delete
* Check for duplicate notes across directories and merge them
* Verify tags are consistent and discoverable

### 5. Create tracker tasks from findings

Review the "What could improve" and "Lessons learned" sections for actionable
items that aren't already tracked. Append a task entry to the appropriate
`.diarie/tasks/tasks-<slug>.yml` file for each — plain Edit/Write on the YAML,
no CRUD helper (substrate-not-opinion):

```yaml
- id: <slug>-<short-id>
  title: "..."
  status: pending
  type: task              # labels: [bug]|[chore]|… carry the framing (4-type model)
  priority: medium        # critical | high | medium | low | backlog — a STRING enum
  acceptance_criteria:    # a LIST, never a string
    - "..."
```

**The priority is a string and the criteria are a list.** Both were bd's shape once
(`priority: 2`, a single free-text criterion) and both are now hard errors —
`invalid priority "2"`, `"acceptance_criteria" must be a list (got string)`. A template
that emits them fails the very gate this step then tells you to run.

The migration target uses **4 types** (`task` / `doc` / `decision` /
`milestone`); the old bug/feature/chore framings ride along in `labels:` on a
`task` row. After appending, run `diarie ready` to re-evaluate
readiness (it is recomputed on every walk, not stored) and
`diarie validate` to confirm the new rows pass the integrity gate.

Include code quality issues, process improvements, and any findings that need
follow-up work. Skip items that are purely observational or already have open
tasks.

**Tracker unavailable (Tier C):** there is no store to file into — instead
append a `### Follow-ups (untracked)` task list to the `RETRO-NN.md` file, one
checkbox per actionable finding, so the items are still captured:

```markdown
### Follow-ups (untracked)

- [ ] {finding} — {type}, {priority}
```

Announce that follow-ups were written to the RETRO file rather than appended to
the tracker (they can be filed later once the tracker is active).

**Decision capture.** When a sprint outcome is a _decision_ (an architectural
or product choice with explicit rationale and rejected alternatives) rather
than a task, bug, or feature, record it as a `decision`-typed document — not a
generic task. Decisions live as standalone markdown files under
`.diarie/decisions/` so they read as ADRs.

Recognize a decision when the sprint surfaced any of:

* A choice between two or more viable approaches with rationale recorded
* A reversal or revision of a previous decision (link it as a supersede)
* A constraint accepted (e.g., "we will not support X until Y") that future
  work must respect

For each decision, write a `.diarie/decisions/<id>.md` file — plain Edit/Write,
no CRUD helper (substrate-not-opinion) — with YAML frontmatter plus the
four-section prose body:

```markdown
---
id: <slug>-<short-id>
title: "..."
type: decision
status: open
---

## Decision

## Rationale

## Alternatives Considered

## Affects
```

The first three prose sections are required; `## Affects` is conventional and
lists impacted components, files, or future work. Run
`diarie validate` afterward to confirm the file passes the integrity
gate.

**Lifecycle:** decision documents stay **open** while the decision is in force.
`status: open` = active decision, `status: closed` = superseded or reversed (NOT
closed-on-create). The retrospective never auto-closes decisions — a later
revision supersedes the prior file by flipping its `status:` to `closed` and
linking the successor. Do not implement supersession here; just capture the new
decision.

**Tracker unavailable (Tier C):** record the decision inline in `RETRO-NN.md` as
a `### Decisions` block carrying the same four sections, instead of writing a
`.diarie/decisions/<id>.md` file:

```markdown
### Decisions

**{decision title}**

- **Decision:** {the choice made}
- **Rationale:** {why}
- **Alternatives considered:** {rejected options}
- **Affects:** {impacted components, files, or future work}
```

Announce that the decision was captured in the RETRO file; it can be promoted
to a `.diarie/decisions/<id>.md` file later once the tracker is active.

### 6. Knowledge gap audit

Run `/knowledge-gaps` (if vp-knowledge is installed):

`/knowledge-gaps` scans all package manifests in the project (npm, Rust crates,
Go modules, PHP Composer, Python PyPI, Ruby gems) and tool manifests (Brewfile,
GitHub Actions workflows, Dockerfile, VSCode extensions). It cross-references
each dependency against Basic Memory notes to identify undocumented packages and
tools.

Steps:

1. Run `/knowledge-gaps` — it handles all manifest types automatically. If
   vp-knowledge is not installed, skip this step and note in the retrospective
   under "What could improve" that knowledge gap coverage was not audited.
2. Include Tier 1 gaps in the retrospective under "What could improve"
3. File tracker tasks for the top 3 undocumented packages or tools (append to
   `.diarie/tasks/tasks-<slug>.yml` per step 5, or the `### Follow-ups
   (untracked)` RETRO block when the tracker is unavailable)

### 7. Write project-independent learnings to Basic Memory

Basic Memory is a **cross-project knowledge base** — it persists across all
repositories and sessions. Notes written here must be generalizable engineering
knowledge, not project-specific implementation details. Ask: "Would this note help
me on a completely different project using the same technology?" If yes, write it.
If it only makes sense in the context of this codebase, it belongs in `MEMORY.md`
or the project `CLAUDE.md` instead.

For each learning, search first, then create or update:

* If no matching note exists: call `mcp__basic-memory__write_note` to create it
* If a note exists with new content: call `mcp__basic-memory__read_note` first
  to get exact content, then call `mcp__basic-memory__edit_note` with
  `find_replace` or `replace_section` — never call `write_note` on an existing
  note (it requires `overwrite=True` and risks replacing the full note content)

Organize by engineering domain:

| Directory               | Topics                                     |
| ----------------------- | ------------------------------------------ |
| `engineering/fastify/`  | Plugin patterns, lifecycle, error handling |
| `engineering/frontend/` | Web components, CSS, dark mode, SSR, a11y  |
| `engineering/database/` | Query patterns, migrations, PostgreSQL     |
| `engineering/testing/`  | Test conventions, infrastructure, coverage |
| `engineering/tooling/`  | Linter config, build pipelines, knip       |
| `engineering/agents/`   | Orchestration, workflow, quality gates     |

**Guidelines:**

* Only write notes for patterns confirmed this sprint — not speculative
* Use concrete code examples, not abstract principles
* Tag notes for discoverability
* **No project-specific internals** — replace project file paths with generic
  descriptions (e.g., "route handler file" not "lib/routes/settings.js"),
  omit table names, and describe patterns in terms of the technology, not
  the application. Referencing vendor packages by npm name (e.g.,
  `@scope/vendor-package`) is fine — they're real published packages.
  Mentioning this project by name is okay when genuinely relevant — just
  don't make the note only useful within this project.
* **Division of labor with upstream-tracker and synergy-tracker.** This step
  writes `engineering/*` notes (patterns, conventions, lessons learned). For
  upstream friction about specific packages or tools, use `/upstream-tracker`
  workflow 6 (Promote to Basic Memory) instead — it writes to the
  `## Upstream Friction` section of entity notes (`npm/*`, `brew/*`, etc.),
  avoiding duplication. For cross-project extraction opportunities tracked in
  `SYNERGY-*.md` files, use `/synergy-tracker` — it manages the extraction
  lifecycle and any corresponding Basic Memory notes. For packages not yet in
  Basic Memory, suggest `/package-intel` or `/tool-intel` for enrichment first.
  **NEVER write to `engineering/agents/vp-plugins-*` paths from this step**
  — those are sibling-relationship notes owned by `/synergy-tracker` workflow 5
  (Promote to Basic Memory). For cross-project lessons that touch a
  sibling-relationship, log via `/synergy-tracker` workflow 1 (Log a synergy
  entry) and let workflow 5 (Promote to Basic Memory) promote them; do not
  shortcut the relationship-note ownership boundary by writing
  `engineering/agents/vp-plugins-*` directly here.

### 8. Suggest documentation updates

After writing the retro, suggest updates to:

* Project `CLAUDE.md` — new conventions, gotchas, or commands discovered
* `MEMORY.md` — stable patterns confirmed across sprints
* `README.md` — if project structure or commands changed

Present suggestions to the user for approval before editing.
