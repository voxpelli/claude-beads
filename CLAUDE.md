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
  synergy-tracker/
    SKILL.md                          # Cross-project synergy tracking (sibling projects)
    references/
      synergy-entry-format.md         # Entry templates, field values, naming, registry schema
agents/
  sprint-review.md                    # Proactive end-of-sprint summary and retro gate
hooks/
  hooks.json                          # Hook definitions (4 event types)
  precompact.sh                       # Emits additionalContext for sprint insight capture
  session-start.sh                    # Sensitive-file warning, dormancy nudge, trend-review reminder
  post-file-edit.sh                   # Auto-format hooks/*.sh with shfmt
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

### Skills (5)

- **backlog-groomer** — Triage, prioritize, and research work in the beads backlog.
  Six workflows: review-and-triage, reprioritize, suggest-closures,
  investigate-topic, create-issues-from-findings, enrich-existing-issue.
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
  In low-activity repos, W1 offers eager inline promotion to Basic Memory to
  prevent entries from staying trapped locally. User-invocable as
  `/upstream-tracker`.
- **vendor-sync** — Pulls latest upstream changes from git subtrees, resolves
  conflicts (always accept upstream), cleans stale node_modules, re-links
  workspaces, cross-references the sync diff against open `UPSTREAM-*.md`
  entries to auto-resolve fixed issues, annotates corresponding Basic Memory
  friction entries on resolution, and verifies with check + test.
  Reads the subtree registry from `.claude/vendor-registry.json`. User-invocable
  as `/vendor-sync`.
- **synergy-tracker** — Manages `SYNERGY-*.md` files that track cross-project
  patterns, divergences, extraction candidates, and capability gaps between
  sibling projects. Supports three workflows: log, review, compare-with-sibling.
  Complements upstream-tracker (which tracks dependency friction) by tracking
  peer-project collaboration opportunities. BM integration via
  `## Cross-Project Synergy` section in sibling entity notes planned for W5.
  User-invocable as `/synergy-tracker`.

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

### Upstream tracking convention

- Files named `UPSTREAM-<package-name>.md` in the project root
- Package name derived from `package` field: slashes → `--`, drop leading `@`
- Vendor packages: permanent files, always exist (even when empty)
- Non-vendor packages: ephemeral files, delete when all entries are resolved
- Vendor packages declared in `.claude/vendor-registry.json` (preferred) or
  inferred from `workspaces` in `package.json`

### Synergy tracking convention

- Files named `SYNERGY-<project-name>.md` in the project root
- Project name derived from sibling repo name: slashes → `--`, drop leading `@`
- Permanent files — never deleted, even when all entries are resolved
- Four sections: Shared Patterns, Divergences, Extraction Candidates,
  They Have / We Don't
- Synergy registry: `.claude/synergy-registry.json` — optional array of
  `{ name, file, remote, bm-entity, relationship }` objects

### Basic Memory section ownership

Three skills own distinct sections in Basic Memory entity notes — they never
overlap:

- **upstream-tracker workflow 6 (Promote)** owns `## Upstream Friction` in `npm/*`, `brew/*`,
  `cask/*`, `actions/*`, `docker/*`, `vscode/*` entity notes
- **synergy-tracker workflow 5 (Promote)** (future) owns `## Cross-Project Synergy` in sibling
  project entity notes
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
bd ready                  → normal development cycle

(sprint end)
sprint-review (agent)     → proactive summary + backlog health signal
  ↓ recommends                (checks BM, flags stale/skewed backlog)
upstream-tracker (skill)  → log/resolve any untracked friction first
  ↓ then                      (workflow 1 (Log) checks BM, workflow 3 (Resolve) annotates BM)
synergy-tracker (skill)   → log/review extraction candidates           [parallel]
  ↓ then                      (ready candidates → act or carry forward)
retrospective (skill)     → generate RETRO-NN.md, write to Basic Memory
  ↓ after retro               (step 7 defers package friction to workflow 6 (Promote))
upstream-tracker workflow 6 → promote generalizable friction to BM entity notes
  ↓ next sprint
vendor-sync (skill)       → pull upstream changes, auto-resolve UPSTREAM entries
  ↓ annotates BM, logs new    (step 8b annotates BM on auto-resolve)
upstream-tracker (skill)  → repeat (workflow 7 (Sync from BM) discovers friction)
```

`sprint-review` is the *gate* (read-only, proactive). `/retrospective` is the
*generator* (user-invoked, writes files). They do not call each other — the user
stays in control of when to commit to the full retro workflow. Basic Memory
serves as the cross-project bridge: workflows 6 and 7 in upstream-tracker provide
bidirectional sync between project-local UPSTREAM files and BM entity notes.
synergy-tracker runs as a parallel track, advancing extraction candidates and
cross-project patterns alongside the upstream friction workflow.

### Relationship to vp-knowledge

`vp-beads` and `vp-knowledge` are complementary plugins. The `retrospective`
skill chains into `/knowledge-gaps` (from vp-knowledge) for the knowledge gap
audit step. Both are available through the `vp-plugins` marketplace at
`voxpelli/vp-claude`.

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

### Session completion

Work is NOT complete until pushed. Before ending a session:

1. `bd close` any finished issues
2. `npm run check` (if code changed)
3. `git push` — mandatory, never skip
4. `bd dolt push` — sync beads to remote

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

All hooks must use `type: "command"` — prompt hooks spawn a separate Haiku
instance with no MCP tool access, making them silently non-functional for
any hook that needs BM or other MCP tools. The validator warns on prompt
hooks to prevent this bug class.

### paths field convention

Skills may declare a `paths` array in frontmatter listing glob patterns for
files the skill operates on. These are activation hints — Claude Code uses
them alongside the description to decide when to suggest the skill. Prefer
specific project-structure patterns (`UPSTREAM-*.md`) over broad globs (`**/*`).
