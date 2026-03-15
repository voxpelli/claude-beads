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
  vendor-sync/SKILL.md                # Pull vendor subtrees and cross-reference UPSTREAM files
agents/
  sprint-review.md                    # Proactive end-of-sprint summary and retro gate
hooks/
  hooks.json                          # Hook definitions (4 event types)
  precompact.sh                       # Emits additionalContext for sprint insight capture
  session-start.sh                    # Trend-review reminder
  post-file-edit.sh                   # Auto-format hooks/*.sh with shfmt
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
  `/upstream-tracker` for mutations. When Basic Memory is available, also
  checks for cross-project friction notes on project dependencies.

### Skills (3)

- **retrospective** — Generates a sprint retrospective: reads git history,
  `UPSTREAM-*.md` files, and conversation context, creates `RETRO-NN.md`, runs
  a knowledge gap audit, writes generalizable learnings to Basic Memory, and
  suggests documentation updates. User-invocable as `/retrospective`.
- **upstream-tracker** — Manages `UPSTREAM-*.md` files that track bugs, feature
  requests, and friction discovered in upstream packages. Supports seven workflows:
  log, review-open, resolve, trend-review, sprint-retro-support,
  promote-to-basic-memory, sync-from-basic-memory. The last two provide
  bidirectional sync between project-local UPSTREAM files and cross-project
  Basic Memory entity notes (`## Upstream Friction` sections). User-invocable
  as `/upstream-tracker`.
- **vendor-sync** — Pulls latest upstream changes from git subtrees, resolves
  conflicts (always accept upstream), cleans stale node_modules, re-links
  workspaces, cross-references the sync diff against open `UPSTREAM-*.md`
  entries to auto-resolve fixed issues, annotates corresponding Basic Memory
  friction entries on resolution, and verifies with check + test.
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
  ↓ recommends                (checks BM for cross-project friction)
upstream-tracker (skill)  → log/resolve any untracked friction first
  ↓ then                      (W1 checks BM on log, W3 annotates BM on resolve)
retrospective (skill)     → generate RETRO-NN.md, write to Basic Memory
  ↓ after retro               (step 7 defers package friction to W6)
upstream-tracker W6       → promote generalizable friction to BM entity notes
  ↓ next sprint
vendor-sync (skill)       → pull upstream changes, auto-resolve UPSTREAM entries
  ↓ annotates BM, logs new    (step 8b annotates BM on auto-resolve)
upstream-tracker (skill)  → repeat (W7 discovers BM friction from other projects)
```

`sprint-review` is the *gate* (read-only, proactive). `/retrospective` is the
*generator* (user-invoked, writes files). They do not call each other — the user
stays in control of when to commit to the full retro workflow. Basic Memory
serves as the cross-project bridge: workflows 6 and 7 in upstream-tracker provide
bidirectional sync between project-local UPSTREAM files and BM entity notes.

### Relationship to vp-knowledge

`vp-beads` and `vp-knowledge` are complementary plugins. The `retrospective`
skill chains into `/knowledge-gaps` (from vp-knowledge) for the knowledge gap
audit step. Both are available through the `vp-plugins` marketplace at
`voxpelli/vp-claude`.

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

Runs `check:plugin` (validate-plugin.mjs) + `check:md` (remark) +
`check:sh` (shellcheck + shfmt on all `hooks/*.sh` files).
All checks must pass before committing. Remark uses `--frail` so warnings are errors.
Requires `shellcheck` and `shfmt` (`brew install shellcheck shfmt`).
