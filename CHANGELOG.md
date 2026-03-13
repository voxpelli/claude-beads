# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.4.0][] - 2026-03-13

### Added

- **`hooks/hooks.json` — `PreCompact` hook** — before context compaction, scans
  the conversation for sprint-relevant insights worth preserving: upstream friction,
  technical decisions, vendor discoveries. Writes findings to Basic Memory using
  `mcp__basic-memory__edit_note` / `write_note` with `[decision]`, `[lesson]`,
  `[gotcha]`, or `[friction]` observation categories. Does nothing if there is
  nothing worth preserving.

### Fixed

- **`skills/upstream-tracker`** — Added `Write` to `allowed-tools`. The "Log a
  new entry" workflow creates new `UPSTREAM-*.md` files for non-vendor packages on
  first encounter; this requires `Write`, which was absent from the allowlist.

### Changed

- **`CLAUDE.md`** — Added `## Releasing` section documenting the cross-repo
  `marketplace.json` bump requirement and plugin cache lag behaviour.
- **`README.md`** — Added `## Changelog` section linking to this file and noting
  the manual marketplace entry bump required after each release.

## [0.3.0][] - 2026-03-13

### Added

- **`hooks/session-start.sh`** + **`hooks/hooks.json`** — `SessionStart` hook
  that emits a one-line trend-review reminder when the upcoming sprint (next
  sprint number divisible by 4) or current sprint (current count divisible by 4)
  is a trend-review sprint. Silent in the common case — zero per-session overhead
  for non-trend-review sprints.

### Changed

- **`skills/retrospective`** — Step 6 "Knowledge gap audit" updated to reflect
  vp-knowledge v0.5.0+: `/knowledge-gaps` now scans all 6 package ecosystems
  (npm, Rust, Go, PHP, Python, Ruby) and 5 tool manifest types (Brewfile, GitHub
  Actions, Dockerfile, VSCode extensions). Manual npm-only fallback removed.
- **`skills/upstream-tracker`** — Extended to non-npm tool tracking (Homebrew
  formulae, casks, GitHub Actions, Docker images, VSCode extensions) using the
  same ephemeral file pattern with `brew:`, `cask:`, `action:`, `docker:`,
  `vscode:` prefix notation. New subsection "Non-npm tools (ephemeral files)"
  added; file naming guideline extended with tool-type examples.
- **`agents/sprint-review`** — Added cross-reference to the `session-reflector`
  agent (vp-knowledge) in the Recommendation step, clarifying the mental model:
  session-reflector for in-sprint capture, `/retrospective` for end-of-sprint
  synthesis.

## [0.2.0][] - 2026-03-09

### Added

- **`skills/vendor-sync`** — Pull latest upstream changes from git subtrees,
  auto-resolve open `UPSTREAM-*.md` entries against the sync diff, clean stale
  vendor `node_modules`, re-link workspaces, and verify with check + test.
  Reads the subtree registry from `.claude/vendor-registry.json`. Accepts an
  optional `[package-name]` argument to sync a single subtree.
- **`agents/sprint-review`** — Proactive, read-only end-of-sprint assessment.
  Triggers automatically when a sprint closes (`bd close`, "sprint done", etc.).
  Summarises commits, open beads issues, and UPSTREAM file state, then gives one
  of four recommendations: not ready, close normally, upstream work first, or
  trend-review sprint. Acts as the gate before `/retrospective`.

### Changed

- **`skills/retrospective`** — Corrected `bd create` syntax (positional title,
  `-t`/`-p` short flags); fixed `bd list --status` flag (space, not `=`); fixed
  git log anchor to use commit hash range instead of `--since` date; renamed MCP
  tool calls to explicit `mcp__basic-memory__*` form; clarified `write_note` vs
  `edit_note` two-path logic (search first, then create or update); renumbered
  steps cleanly 1–8 (removed confusing `6.5` label); tightened description
  trigger phrases.
- **`skills/upstream-tracker`** — Added `Bash` to `allowed-tools` (required for
  `git rm` in resolve and trend-review workflows); trimmed description from
  ~180 words to ~80; added empty-file template for new non-vendor packages;
  added empirical resolution timelines to trend review (bugs: 5–10 sprints,
  FRs: 10–20, cross-vendor: next major version); added optional `[upstream: url]`
  trailer to all entry formats; added optional `[blocking|degraded|minor]`
  severity tag to bug entries.
- **`skills/vendor-sync`** — Fixed `git show HEAD --stat` → `git show HEAD --
  <prefix>` so the full diff is available for UPSTREAM auto-resolution; added
  conflict-detection step before resolution; added `argument-hint: "[package-name]"`
  frontmatter; added fallback `git merge -X subtree=` command for when subtree
  heuristics fail; added "vendor changes" trigger phrase.

## [0.1.0][] - 2026-03-09

### Added

- **`skills/retrospective`** — Sprint retrospective generator. Reads git history,
  `UPSTREAM-*.md` files, and conversation context to produce `RETRO-NN.md` files.
  Every 4th sprint triggers a full trend review (UPSTREAM files, beads health,
  Basic Memory graph health). Promoted and generalized from a project-local skill.
- **`skills/upstream-tracker`** — Upstream issue tracking for vendor and npm
  packages. Manages `UPSTREAM-*.md` files with five workflows: log, review,
  resolve, trend-review, and retrospective-support. Vendor packages are declared
  via `.claude/vendor-registry.json` or `workspaces`. Promoted and generalized
  from a project-local skill.

[0.4.0]: https://github.com/voxpelli/claude-beads/releases/tag/v0.4.0
[0.3.0]: https://github.com/voxpelli/claude-beads/releases/tag/v0.3.0
[0.2.0]: https://github.com/voxpelli/claude-beads/releases/tag/v0.2.0
[0.1.0]: https://github.com/voxpelli/claude-beads/releases/tag/v0.1.0
