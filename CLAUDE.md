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
agents/                               # Empty — v0.2 may add a sprint-review agent
hooks/                                # Empty — no automated hooks in v0.1
CLAUDE.md
README.md
CHANGELOG.md
```

No runtime code — pure markdown + JSON. No build step, no dependencies.

## Components

### Skills (2)

- **retrospective** — Generates a sprint retrospective: reads git history,
  `UPSTREAM-*.md` files, and conversation context, creates `RETRO-NN.md`, runs
  a knowledge gap audit, writes generalizable learnings to Basic Memory, and
  suggests documentation updates. User-invocable as `/retrospective`.
- **upstream-tracker** — Manages `UPSTREAM-*.md` files that track bugs, feature
  requests, and friction discovered in upstream packages. Supports five workflows:
  log, review-open, resolve, trend-review, sprint-retro-support. User-invocable
  as `/upstream-tracker`.

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

### Upstream tracking convention

- Files named `UPSTREAM-<package-name>.md` in the project root
- Vendor packages: permanent files, always exist (even when empty)
- Non-vendor packages: ephemeral files, delete when all entries are resolved
- Vendor packages declared in `.claude/vendor-registry.json` (if it exists) or
  `workspaces` in `package.json`

### Relationship to vp-knowledge

`vp-beads` and `vp-knowledge` are complementary plugins. The `retrospective`
skill chains into `/knowledge-gaps` (from vp-knowledge) for the knowledge gap
audit step. Both are available through the `vp-plugins` marketplace at
`voxpelli/vp-claude`.

## Validation

```
npm run check
```

Runs `check:plugin` (validate-plugin.mjs) + `check:md` (remark).
All checks must pass before committing. Remark uses `--frail` so warnings are errors.
