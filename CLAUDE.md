# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A Claude Code plugin (`vp-beads`) providing sprint workflow automation for projects
using [beads](https://github.com/steveyegge/beads) and
[Basic Memory](https://github.com/basicmachines-co/basic-memory). These skills
promote project-local sprint workflow patterns into a shareable, installable plugin.

## Plugin Layout

```
.claude-plugin/
  plugin.json                         # Plugin manifest
skills/
  retrospective/SKILL.md              # Sprint retrospective generator
  upstream-tracker/
    SKILL.md                          # Upstream issue tracking + BM friction sync
    references/
      basic-memory-friction-format.md # BM section templates, routing, edit_note gotchas
  backlog-groomer/
    SKILL.md                          # Backlog triage, research, issue creation
    references/
      backlog-health-heuristics.md    # Staleness, closure, priority, issue templates
  vendor-sync/SKILL.md                # Pull vendor subtrees and cross-reference UPSTREAM files
  sibling-sync/SKILL.md               # Bilateral SYNERGY/UPSTREAM reconciliation between siblings
  synergy-tracker/
    SKILL.md                          # Cross-project synergy tracking (sibling projects)
    references/
      synergy-entry-format.md         # Entry templates, field values, naming, registry schema
  swarm-wave/
    SKILL.md                          # Multi-agent wave orchestration
    references/
      wave-planning-checklist.md      # Pre/post-wave gates, anti-patterns
      file-contention-and-clustering.md # Contention thresholds, wave sizing
      review-gate-protocol.md         # Two-reviewer gate, confidence thresholds
      agent-concurrency-limits.md     # Memory pressure, backpressure protocol
      command-patterns.md             # Research agent selection, agent prompts
agents/
  sprint-review.md                    # Proactive end-of-sprint summary and retro gate
hooks/
  hooks.json                          # Hook definitions (4 event types)
  precompact.sh                       # Emits additionalContext for sprint insight capture
  session-start.sh                    # Sensitive-file warning, dormancy nudge, trend-review reminder
  post-file-edit.sh                   # Auto-format hooks/*.sh and scripts/*.sh with shfmt
  post-bm-failure-classify.sh         # Basic Memory error classification + recovery guidance
CLAUDE.md
README.md
CHANGELOG.md
```

No application code — skills are pure markdown, hooks are shell scripts.
Dev tooling only: validation and linting via `npm run check`.

## Components

### Agent (1)

- **sprint-review** — Proactively triggers at end-of-sprint boundaries (`bd close`,
  "sprint done", "what did we accomplish"). Reads git history, beads state, and
  UPSTREAM files, then gives a concise summary and one of five recommendations:
  not ready, close normally, groom backlog first, do upstream work first, or
  trend-review sprint.
  Read-only — never writes files; defers to `/retrospective` and
  `/upstream-tracker` for mutations. When Basic Memory is available, also
  checks for cross-project friction notes on project dependencies.

### Skills (7)

- **backlog-groomer** — Triage, prioritize, and research work in the beads backlog.
  Six workflows: review-and-triage, reprioritize, suggest-closures,
  investigate-topic-as-spike, create-issues-from-findings, enrich-existing-issue.
  Cross-references Basic Memory for known friction and uses Tavily/DeepWiki for
  external research. User-invocable as `/backlog-groomer`.
- **retrospective** — Generates a sprint retrospective: reads git history,
  `UPSTREAM-*.md` files, and conversation context, creates `RETRO-NN.md`, runs
  a knowledge gap audit, writes generalizable learnings to Basic Memory, and
  suggests documentation updates. User-invocable as `/retrospective`.
- **upstream-tracker** — Manages `UPSTREAM-*.md` files that track bugs, feature
  requests, contribution opportunities, and friction discovered in upstream
  packages. Supports seven workflows: log, review-open, resolve, trend-review,
  sprint-retro-support, promote-to-basic-memory, sync-from-basic-memory. The
  last two provide bidirectional sync between project-local UPSTREAM files and
  cross-project Basic Memory entity notes (`## Upstream Friction` sections).
  In low-activity repos, workflow 1 (Log) offers eager inline promotion to Basic Memory to
  prevent entries from staying trapped locally. User-invocable as
  `/upstream-tracker`.
- **vendor-sync** — Pulls latest upstream changes from git subtrees, resolves
  conflicts (always accept upstream), cleans stale node_modules, re-links
  workspaces, cross-references the sync diff against open `UPSTREAM-*.md`
  entries to auto-resolve fixed issues, annotates corresponding Basic Memory
  friction entries on resolution, and verifies with check + test.
  Reads the subtree registry from `.claude/vendor-registry.json`. User-invocable
  as `/vendor-sync`.
- **sibling-sync** — Bilateral reconciliation of `SYNERGY-*.md` and
  `UPSTREAM-*.md` files between this project and its registered sibling
  vp-* projects. Four workflows: discover-siblings (registry resolution +
  path probing), sync-sibling-synergy (reciprocal gaps, stale alignment
  claims, divergence convergence-status drift), sync-sibling-upstream
  (two pairing modes — Mode A: shared-dependency basename intersection
  surfacing duplicate friction, complementary workarounds, sibling-only
  entries; Mode B: reciprocal sibling-friction pairs `UPSTREAM-<sibling>.md`
  here ↔ `UPSTREAM-<this-project>.md` there, surfacing friction the sibling tracks
  about us, our open friction against them, and cross-side staleness from
  shipped fixes), apply-reciprocation-batch (opt-in `--auto-reciprocate`
  flag, per-entry confirmation, writes only to the sibling side; SYNERGY
  finding (a) only — never UPSTREAM). Read-only by default. Distinct from
  `/vendor-sync` (upstream → project drift, subtree pulls) and
  `/synergy-tracker` (logging entries here on this side); sibling-sync
  compares both sides without writing on this side. User-invocable as
  `/sibling-sync`.
- **synergy-tracker** — Manages `SYNERGY-*.md` files that track cross-project
  patterns, divergences, extraction candidates, and capability gaps between
  sibling projects. Supports five workflows: log, review, compare-with-sibling,
  trend-review, promote-to-basic-memory.
  Complements upstream-tracker (which tracks dependency friction) by tracking
  peer-project collaboration opportunities. BM integration via
  `## Cross-Project Synergy` section in sibling entity notes via workflow 5 (Promote to Basic Memory).
  User-invocable as `/synergy-tracker`.
- **swarm-wave** — Orchestrates multi-agent development sprints with wave-based
  parallelism. Five workflows: plan-sprint (file-disjoint wave partitioning),
  execute-wave (parallel agent launches with file-scope isolation),
  post-wave-gate (two-reviewer quality gate), file-contention-map (standalone
  utility), research-wave (parallel research with backlog-groomer handoff).
  Manages ephemeral `SWARM-NN.md` files. User-invocable as `/swarm-wave`.

## Conventions

### Skill frontmatter

Required fields: `name`, `description`, `user-invocable`, `allowed-tools`. The
`description` is a trigger phrase list — write it so Claude picks the right skill
when a user says something relevant. The `allowed-tools` list is an allowlist;
only include tools the skill actually calls.

### Workflow cross-references

Skills reference each other's workflows as "workflow N (Name)" — always
include the name parenthetically. Bare numbers (e.g., "workflow 6") are
fragile and break silently if workflows are renumbered. Never use shorthand
like "W3" or "W6" — the codebase spells it out.

### Retrospective file convention

- Named `RETRO-NN.md` in the project root
- Sprint number increments by 1 from the highest existing number
- Every 4th sprint triggers a full trend review (UPSTREAM files, beads health,
  Basic Memory graph health)

### Vendor registry convention

- File: `.claude/vendor-registry.json` — array of `{ prefix, remote, branch, package }` objects
- **prefix** — local `vendor/` subtree directory (e.g. `"vendor/my-pkg"`)
- **remote** — git remote alias (e.g. `"my-pkg"`)
- **branch** — upstream branch to pull (e.g. `"main"`)
- **package** — npm package name; maps to the `UPSTREAM-*.md` filename
- **local-path** (optional) — alternative on-disk path for the subtree if it
  does not live at `prefix`. When absent, skills use `prefix` as the on-disk
  location.
- Local override file: `.claude/vendor-registry.local.json` — gitignored
  companion mirroring the `settings.local.json` convention. Per-entry merge
  by the `package` key; fields in `.local.json` win. Skills load the base
  registry first, then merge the override on top. Entries in `.local.json`
  whose `package` is not in the base registry are ignored. Used by vendor-sync
  workflow 1 (Determine scope). Never committed — encodes machine-specific
  paths.

### Upstream tracking convention

- Files named `UPSTREAM-<package-name>.md` in the project root
- Package name derived from `package` field: slashes → `--`, drop leading `@`
- Vendor packages: permanent files, always exist (even when empty)
- Non-vendor packages: ephemeral files, delete when all entries are resolved
- Vendor packages declared in `.claude/vendor-registry.json` (preferred) or
  inferred from `workspaces` in `package.json`

### Synergy tracking convention

- Files named `SYNERGY-<project-name>.md` in the project root
- Project name derived via the four-tier algorithm in
  `skills/synergy-tracker/references/project-name-derivation.md`
  (sibling-registry back-pointer → plugin manifest → package manifest /
  registry `name` → directory basename); normalization rules
  (slashes → `--`, drop leading `@`) live in
  `skills/synergy-tracker/references/synergy-entry-format.md` "Naming
  convention". Both `/synergy-tracker` and `/sibling-sync` use the same
  algorithm
- Permanent files — never deleted, even when all entries are resolved
- Four sections: Shared Patterns, Divergences, Extraction Candidates,
  They Have / We Don't
- Synergy registry: `.claude/synergy-registry.json` — optional array of
  `{ name, file, remote, bm-entity, relationship, local-path }` objects.
  `local-path` (optional) gives the on-disk path to the sibling checkout
  (relative paths resolve from this project root); when absent, skills fall
  back to `../<name>/`.
- Local override file: `.claude/synergy-registry.local.json` — gitignored
  companion mirroring the `settings.local.json` convention. Per-entry merge
  by the `name` key; fields in `.local.json` win. Skills load the base
  registry first, then merge the override on top. Entries in `.local.json`
  whose `name` is not in the base registry are ignored. Used by synergy-tracker
  workflow 3 (Compare with sibling). Never committed — encodes
  machine-specific paths.

### Basic Memory section ownership

Three skills own distinct sections in Basic Memory entity notes — they never
overlap:

- **upstream-tracker workflow 6 (Promote)** owns `## Upstream Friction` in `npm/*`, `brew/*`,
  `cask/*`, `actions/*`, `docker/*`, `vscode/*` entity notes
- **synergy-tracker workflow 5 (Promote)** owns `## Cross-Project Synergy` in
  sibling-relationship notes (canonically
  `engineering/agents/vp-plugins-<this-project>-and-<sibling>` — these are
  bilateral relationship notes, NOT single-project entity notes)
- **retrospective step 7** owns `engineering/*` notes (patterns, conventions)

Annotation-only writers (not owners): vendor-sync step 8b and upstream-tracker
workflow 3 (Resolve) annotate `## Upstream Friction` entries but never delete
or move them.

### Sprint workflow cycle

The agent and skills form a lightweight cycle:

```
(sprint start)
backlog-groomer (skill)   → triage backlog, research new work, create issues
  ↓ then
swarm-wave (skill)        → plan waves, execute with parallel agents   [optional]
  ↓ or                        (workflow 1 (Plan) plans, workflows 2 (Execute) + 3 (Gate) loop per wave)
bd ready                  → normal development cycle

(sprint end)
sprint-review (agent)     → proactive summary + backlog health signal
  ↓ recommends                (checks BM, flags stale/skewed backlog)
upstream-tracker (skill)  → log/resolve any untracked friction first
  ↓ then                      (workflow 1 (Log) checks BM, workflow 3 (Resolve) annotates BM)
synergy-tracker (skill)   → log/review extraction candidates           [parallel]
  ↓ then                      (ready candidates → act or carry forward)
                            ←→ sibling-sync (skill) — bilateral SYNERGY/UPSTREAM
                               drift diagnostic [parallel, optional; read-only
                               by default; --auto-reciprocate writes reciprocal
                               entries to sibling side with per-entry
                               confirmation; never writes on this side or to BM]
retrospective (skill)     → generate RETRO-NN.md, write to Basic Memory
  ↓ after retro               (step 7 defers package friction to workflow 6 (Promote))
upstream-tracker workflow 6 (Promote) → promote generalizable friction to BM entity notes
  ↓ next sprint
vendor-sync (skill)       → pull upstream changes, auto-resolve UPSTREAM entries
  ↓ annotates BM, logs new    (step 8b annotates BM on auto-resolve)
upstream-tracker (skill)  → repeat (workflow 7 (Sync from BM) discovers friction)
```

`sprint-review` is the *gate* (read-only, proactive). `/retrospective` is the
*generator* (user-invoked, writes files). They do not call each other — the user
stays in control of when to commit to the full retro workflow. Basic Memory
serves as the cross-project bridge: workflows 6 (Promote) and 7 (Sync from BM) in upstream-tracker provide
bidirectional sync between project-local UPSTREAM files and BM entity notes.
synergy-tracker runs as a parallel track, advancing extraction candidates and
cross-project patterns alongside the upstream friction workflow. `sibling-sync`
is an optional bilateral diagnostic that runs alongside synergy-tracker
workflow 2 (Review) — or before workflow 4 (Trend Review) every 4th sprint —
to detect SYNERGY/UPSTREAM drift between sibling repos; it never gates the
linear sprint flow.

### Relationship to vp-knowledge

`vp-beads` and `vp-knowledge` form a layered plugin pair. vp-knowledge owns
Basic Memory infrastructure: write-validation hooks (`post-bm-write-validate.sh`
triggers `schema_validate` after every `write_note`/`edit_note`), note quality
standards, and graph health tooling. vp-beads builds sprint workflows on top,
relying on vp-knowledge's hooks to validate BM writes from upstream-tracker,
synergy-tracker, vendor-sync, and retrospective.

**Do not duplicate vp-knowledge hooks in vp-beads.** Both plugins are always
co-installed; duplicating hooks causes double-fire and maintenance burden.

Specific integration points: retrospective step 6 chains into `/knowledge-gaps`
(from vp-knowledge); all BM writes are validated by vp-knowledge's PostToolUse
hook; sprint learnings are written to the same BM graph. Both are available
through the `vp-plugins` marketplace at `voxpelli/vp-claude`.

## Agent Guidelines

### Non-interactive shell commands

Shell commands like `cp`, `mv`, and `rm` may be aliased to include `-i`
(interactive) mode, causing agents to hang. Always use force flags:

```bash
cp -f source dest       # NOT: cp source dest
mv -f source dest       # NOT: mv source dest
rm -f file              # NOT: rm file
rm -rf directory        # NOT: rm -r directory
```

### Issue tracking with beads

This project uses `bd` (beads) for all issue tracking. Do NOT use markdown TODOs
or task lists. Run `bd ready` to find available work, `bd update <id> --claim` to
claim it, `bd close <id>` to complete it.

### Issue types (9 total)

All issue types are validated on creation with `validation.on-create=error`. Authoritative source: BM `brew/brew-beads` `### Issue Types (Core Vocabulary)`. Provenance: `engineering/agents/cli-validation-discovery-via-json-error-probing`.

| Type | Required markdown sections | When to use |
| --- | --- | --- |
| `task` | *(none)* | Single atomic unit of work |
| `bug` | `## Steps to Reproduce`, `## Acceptance Criteria` | Something in production/main broke |
| `feature` | `## Acceptance Criteria` | New user-facing capability |
| `chore` | *(none)* | Internal maintenance, cleanup, refactor |
| `epic` | `## Success Criteria` | Large initiative spanning 5+ issues; tracks work across sprints |
| `decision` | `## Decision`, `## Rationale`, `## Alternatives Considered` | Record an architectural or product choice with reasoning |
| `spike` | `## Goal`, `## Findings` | Timeboxed investigation (1–3 days) to answer a question before committing to work. Always closes with findings, not code. |
| `story` | `## Acceptance Criteria` | User-centric reframing of a feature: "As a \[user], I can \[action] so that \[outcome]" |
| `milestone` | *(none)* | Structural marker (e.g., `v1.0`, `public-alpha`, `launch-date`). No effort, no assignment. Groups related issues. |

### Session completion

Work is NOT complete until pushed. Before ending a session:

1. `bd close` any finished issues
2. `npm run check` (if code changed)
3. `git push` — mandatory, never skip
4. `bd dolt push` — sync beads to remote

### Do not run `bd setup claude`

`bd setup claude --check` will report `⚠ CLAUDE.md exists but no beads section
found` — this is intentional. Do not "fix" it by running `bd setup claude`.

The `bd setup claude` command appends a ~50-line beads workflow template to
`CLAUDE.md` (core rules, quick reference, workflow steps, issue types,
priorities). vp-beads's `SessionStart` hook already injects equivalent
workflow context dynamically (~1.5k tokens of `bd` commands plus all
persistent memories). Adding the static template would double-inject the
same guidance — once via always-loaded `CLAUDE.md` and once via the hook —
wasting context tokens with no benefit.

The `bd setup claude` template is the right choice for projects *without* a
Claude Code plugin like vp-beads. Here, the plugin's hook is more current
and project-tailored. The global hooks side (`~/.claude/settings.json`) is
unrelated and may be installed via `bd setup claude --global` if missing.

## Releasing

1. Bump `plugin.json` version and add CHANGELOG entry
2. Run `npm run check`
3. Run `plugin-dev:skill-reviewer` agent on all modified skills — it catches
   `allowed-tools` gaps and vocabulary inconsistencies that `npm run check` misses
4. Bump `vp-beads` entry in `vp-claude/.claude-plugin/marketplace.json`
5. Commit, push, tag, push tag

The two repos are independent — the marketplace entry doesn't update automatically
and will silently serve a stale version to anyone who installs via `vp-plugins`.

Installed plugin caches also lag: after a release, users must reinstall to pick
up the new version (`/plugin install vp-beads@vp-plugins`).

## Validation

```
npm run check
```

Runs four checks in parallel via `run-p check:*` (`npm-run-all2`):
`check:plugin` (validate-plugin.mjs) + `check:md` (remark) +
`check:sh` (shellcheck + shfmt on all `hooks/*.sh` files) +
`check:hooks` (hook integration tests via `scripts/check-hooks.mjs`).
All checks must pass before committing. Remark uses `--frail` so warnings are errors.
Requires `shellcheck` and `shfmt` (`brew install shellcheck shfmt`).

`validate-plugin.mjs` includes a tool-reference audit: any `mcp__*__*` tool
pattern mentioned in skill/agent prose but missing from the `allowed-tools` or
`tools` frontmatter will fail validation. This catches the most common bug class
in this plugin (missing `allowed-tools` entries).

### Hook type constraint

All hooks in this plugin must use `type: "command"` — prompt hooks spawn a
separate Haiku instance with no MCP tool access, making them silently
non-functional for any hook that needs BM or other MCP tools. The validator
warns on prompt hooks to prevent this bug class. The validator also accepts
`agent` and `http` hook types (used by other plugins) without warning.

### paths field convention

Skills may declare a `paths` array in frontmatter listing glob patterns for
files the skill operates on. These are activation hints — Claude Code uses
them alongside the description to decide when to suggest the skill. Prefer
specific project-structure patterns (`UPSTREAM-*.md`) over broad globs (`**/*`).
