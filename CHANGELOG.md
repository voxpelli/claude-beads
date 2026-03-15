# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.7.0][] - 2026-03-15

### Added

- **`skills/backlog-groomer` — new skill with 6 workflows** — triage, reprioritize,
  suggest closures, investigate topics, create issues from findings, and enrich
  existing issues. Orchestrates `bd` CLI primitives (stale, duplicates, search,
  blocked) into guided grooming sessions. Research workflows use Basic Memory,
  DeepWiki, and Tavily for multi-source investigation. All mutations require
  explicit user approval. Includes `references/backlog-health-heuristics.md`
  for staleness thresholds, closure criteria, priority/type assignment logic,
  title conventions, and description templates.
- **`agents/sprint-review` — backlog health signal in Step 3** — checks open
  issue count (>20 elevated, >30 grooming trigger), stale issues (>60 days),
  blocked chains, and in-progress pile-ups. New "Groom the backlog first"
  recommendation (5th path) in Step 5.

## [0.6.2][] - 2026-03-15

### Fixed

- **`skills/retrospective` — added `mcp__basic-memory__read_note` to
  `allowed-tools`** — step 7 instructs `edit_note` with `find_replace` on
  existing notes, which requires reading the note first. Same class of bug
  as the v0.6.0 `read_note` omission in upstream-tracker and vendor-sync.
  Also updated step 7 prose to explicitly call `read_note` before `edit_note`.
- **`validate-plugin.mjs` — recursive agent directory scan** — agent validation
  now uses `readdir({ recursive: true })` to match the skills pattern. Prevents
  agents in subdirectories from being silently skipped.
- **`hooks/hooks.json` — expanded PostToolUseFailure matcher** — added
  `schema_validate`, `schema_diff`, `schema_infer` to the BM error recovery
  hook matcher. These tools are used during trend-review sprints.

## [0.6.1][] - 2026-03-15

### Added

- **`validate-plugin.mjs` — tool-reference audit** — cross-checks `mcp__*__*`
  patterns in skill/agent prose against `allowed-tools`/`tools` frontmatter.
  Ported from vp-claude. Caught a real bug on first run (`write_note` referenced
  in upstream-tracker prose but removed from allowlist).
- **`hooks/hooks.json` — PostToolUseFailure hook for BM errors** — classifies
  Basic Memory MCP tool failures into 5 categories (server unavailable, invalid
  argument, note not found, permission error, unknown) with actionable recovery
  guidance. Prompt hook, 10s timeout.
- **`hooks/post-file-edit.sh` — PostToolUse shell auto-formatting** — auto-formats
  `hooks/*.sh` with `shfmt -w` on every Edit/Write. Skips silently if shfmt not
  installed. Pattern from vp-claude.
- **`skills/upstream-tracker/references/` — progressive disclosure** — extracted
  BM friction section template, routing table, generalization rules, and
  `edit_note` gotchas from SKILL.md to
  `references/basic-memory-friction-format.md`. SKILL.md dropped from 3,118 to
  2,923 words.

## [0.6.0][] - 2026-03-15

### Added

- **`skills/upstream-tracker` — Workflow 6 "Promote to Basic Memory"** —
  promotes generalizable upstream friction from project-local UPSTREAM files
  into cross-project Basic Memory entity notes. Supports all target types
  (npm, brew, cask, action, docker, vscode, non-package repos). Filters by
  Ownership (skips `us` entries), applies a generalization transform, and
  targets `## Upstream Friction` sections with Bug/FR/Resolved subsections.
  When no Basic Memory note exists, flags for enrichment via `/package-intel`
  or `/tool-intel` instead of creating thin notes.
- **`skills/upstream-tracker` — Workflow 7 "Sync from Basic Memory"** —
  discovers friction already known in Basic Memory for this project's
  dependencies but not yet tracked locally. Pull-based, user-invoked.
- **`skills/upstream-tracker` — Workflow 1 BM deduplication pre-check** —
  before logging a new entry, checks Basic Memory for existing friction on
  the same package from other projects. Informational only.
- **`skills/upstream-tracker` — Workflow 3 BM annotation on resolve** —
  when an UPSTREAM entry is resolved, annotates the corresponding Basic Memory
  friction entry with a resolved timestamp. Annotation only — workflow 6's
  prune pass handles moves to Resolved.
- **`skills/vendor-sync` — Step 8b BM annotation** — after auto-resolving
  UPSTREAM entries via changelog/diff cross-reference, annotates the
  corresponding Basic Memory friction entries. Best-effort, skips silently
  when Basic Memory is unavailable.
- **`agents/sprint-review` — Step 4 BM friction awareness** — when Basic
  Memory tools are available, checks for friction notes on project
  dependencies not covered by local UPSTREAM files and suggests workflow 7.

### Fixed

- **`skills/upstream-tracker` — vendor registry shape** — added missing
  `package` field to the vendor registry object description (`{prefix, remote,
  branch}` → `{prefix, remote, branch, package}`).
- **`skills/retrospective` — added `mcp__basic-memory__*` tools to
  `allowed-tools`** — steps 4 and 7 reference these tools in the skill body
  but they were absent from the frontmatter allowlist.

### Changed

- **`skills/retrospective` — step 7 division-of-labor note** — clarifies
  that step 7 writes `engineering/*` notes while upstream friction about
  specific packages/tools should use `/upstream-tracker` workflow 6.
- **`skills/retrospective` — step 3 alignment** — explicitly names
  `/upstream-tracker` for logging new friction during retrospectives.
- **`hooks/precompact.sh` — resolved entry awareness** — added prompt for
  annotating Basic Memory when UPSTREAM entries are resolved during a session.

## [0.5.1][] - 2026-03-14

### Fixed

- **`skills/vendor-sync` — added `Write` and `Grep` to `allowed-tools`** —
  `Write` is needed for UPSTREAM file creation edge cases during cross-reference,
  `Grep` for changelog keyword matching in Step 7. Same class of bug as the
  v0.4.0 upstream-tracker `Write` omission.
- **`skills/vendor-sync` — Step 7 changelog diff uses pre-pull hash** —
  replaced fragile `git diff HEAD~1` with `$PRE_PULL_HEAD` captured before
  Step 3. The previous approach broke when conflict resolution in Step 4
  added extra commits.
- **`skills/upstream-tracker` — aligned severity vocabulary** — the structured
  `Severity:` field used `blocking/annoying/cosmetic` while the inline bracket
  notation used `blocking/degraded/minor`. Unified to `blocking/degraded/minor`
  (the established terms).

## [0.5.0][] - 2026-03-14

### Fixed

- **`hooks/hooks.json` — PreCompact hook converted from prompt to command** —
  the previous `type: "prompt"` hook was non-functional: prompt hooks spawn a
  separate Haiku instance with no MCP tool access, making the
  `mcp__basic-memory__*` instructions unreachable. Now uses `type: "command"`
  with a `precompact.sh` script that emits `additionalContext` JSON, injecting
  reflection instructions into the main Claude session which has full MCP access.
  Timeout drops from 30s to 5s (static JSON output). Also adds explicit
  search-first / `overwrite` guard instructions for Basic Memory `write_note`
  safety.

### Added

- **`skills/vendor-sync` — changelog-aware auto-resolution** — new step 7
  parses the upstream `CHANGELOG.md` diff after a subtree pull and AI-matches
  entries against open `UPSTREAM-*.md` items with confidence levels (high /
  medium / low). High-confidence matches auto-resolve; medium are reported for
  user decision.
- **`skills/upstream-tracker` — enriched entry format** — optional structured
  fields (`Severity:`, `Ownership:`, `Workaround:`) on a continuation line below
  each entry. Backward-compatible — existing entries without these fields remain
  valid. `Severity` (blocking/annoying/cosmetic) captures daily impact,
  `Ownership` (upstream/us/shared) clarifies who acts, and `Workaround`
  (none/partial/full) aids triage priority.

### Changed

- **`skills/retrospective` — Step 7 overwrite guard** — added explicit warning
  against calling `write_note` on existing notes (requires `overwrite=True` and
  risks data loss); reinforces the search-first pattern.
- **`skills/retrospective` — Step 2 edge case documentation** — documented two
  edge cases where `git log -- RETRO-*.md` returns empty (no prior RETRO files,
  or RETRO files are gitignored), both resulting in full-history range — the
  correct graceful behavior for a first retrospective.

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
  of five recommendations (as of v0.7.0): not ready, close normally, groom
  backlog first, upstream work first, or trend-review sprint. Acts as the gate
  before `/retrospective`.

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

[0.7.0]: https://github.com/voxpelli/claude-beads/releases/tag/v0.7.0
[0.6.2]: https://github.com/voxpelli/claude-beads/releases/tag/v0.6.2
[0.6.1]: https://github.com/voxpelli/claude-beads/releases/tag/v0.6.1
[0.6.0]: https://github.com/voxpelli/claude-beads/releases/tag/v0.6.0
[0.5.1]: https://github.com/voxpelli/claude-beads/releases/tag/v0.5.1
[0.5.0]: https://github.com/voxpelli/claude-beads/releases/tag/v0.5.0
[0.4.0]: https://github.com/voxpelli/claude-beads/releases/tag/v0.4.0
[0.3.0]: https://github.com/voxpelli/claude-beads/releases/tag/v0.3.0
[0.2.0]: https://github.com/voxpelli/claude-beads/releases/tag/v0.2.0
[0.1.0]: https://github.com/voxpelli/claude-beads/releases/tag/v0.1.0
