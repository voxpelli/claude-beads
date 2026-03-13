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
  upstream-tracker/SKILL.md           # Upstream issue tracking for vendor/npm packages
  vendor-sync/SKILL.md                # Pull vendor subtrees and cross-reference UPSTREAM files
agents/
  sprint-review.md                    # Proactive end-of-sprint summary and retro gate
hooks/                                # Empty — no automated hooks
CLAUDE.md
README.md
CHANGELOG.md
```

No runtime code — pure markdown + JSON. No build step, no dependencies.

## Components

### Agent (1)

- **sprint-review** — Proactively triggers at end-of-sprint boundaries (`bd close`,
  "sprint done", "what did we accomplish"). Reads git history, beads state, and
  UPSTREAM files, then gives a concise summary and one of four recommendations:
  not ready, close normally, do upstream work first, or trend-review sprint.
  Read-only — never writes files; defers to `/retrospective` and
  `/upstream-tracker` for mutations.

### Skills (3)

- **retrospective** — Generates a sprint retrospective: reads git history,
  `UPSTREAM-*.md` files, and conversation context, creates `RETRO-NN.md`, runs
  a knowledge gap audit, writes generalizable learnings to Basic Memory, and
  suggests documentation updates. User-invocable as `/retrospective`.
- **upstream-tracker** — Manages `UPSTREAM-*.md` files that track bugs, feature
  requests, and friction discovered in upstream packages. Supports five workflows:
  log, review-open, resolve, trend-review, sprint-retro-support. User-invocable
  as `/upstream-tracker`.
- **vendor-sync** — Pulls latest upstream changes from git subtrees, resolves
  conflicts (always accept upstream), cleans stale node_modules, re-links
  workspaces, cross-references the sync diff against open `UPSTREAM-*.md`
  entries to auto-resolve fixed issues, and verifies with check + test.
  Reads the subtree registry from `.claude/vendor-registry.json`. User-invocable
  as `/vendor-sync`.

## Conventions

### Skill frontmatter

Required fields: `name`, `description`, `user-invocable`, `allowed-tools`. The
`description` is a trigger phrase list — write it so Claude picks the right skill
when a user says something relevant. The `allowed-tools` list is an allowlist;
only include tools the skill actually calls.

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

### Sprint workflow cycle

The agent and skills form a lightweight cycle:

```
sprint-review (agent)     → proactive summary at sprint boundary
  ↓ recommends
upstream-tracker (skill)  → log/resolve any untracked friction first
  ↓ then
retrospective (skill)     → generate RETRO-NN.md, write to Basic Memory
  ↓ next sprint
vendor-sync (skill)       → pull upstream changes, auto-resolve UPSTREAM entries
  ↓ logs new friction to
upstream-tracker (skill)  → repeat
```

`sprint-review` is the *gate* (read-only, proactive). `/retrospective` is the
*generator* (user-invoked, writes files). They do not call each other — the user
stays in control of when to commit to the full retro workflow.

### Relationship to vp-knowledge

`vp-beads` and `vp-knowledge` are complementary plugins. The `retrospective`
skill chains into `/knowledge-gaps` (from vp-knowledge) for the knowledge gap
audit step. Both are available through the `vp-plugins` marketplace at
`voxpelli/vp-claude`.

## Validation

```
npm run check
```

Runs `check:plugin` (validate-plugin.mjs) + `check:md` (remark) +
`check:sh` (shellcheck + shfmt on all `hooks/*.sh` files).
All checks must pass before committing. Remark uses `--frail` so warnings are errors.
Requires `shellcheck` and `shfmt` (`brew install shellcheck shfmt`).
