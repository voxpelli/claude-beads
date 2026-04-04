# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.10.0][] - 2026-04-04

### Fixed

- **`hooks/hooks.json` — PostToolUseFailure conversion to command hook** — the
  shell script `post-bm-failure-classify.sh` existed since v0.9.2 but was dead
  code: `hooks.json` still declared `type: "prompt"`, meaning a Haiku instance
  received BM recovery instructions it could never execute. Now correctly wired
  as `type: "command"`. BM failure recovery is functional for the first time.
- **`skills/retrospective` — remove 'sprint review' trigger overlap** — the
  phrase 'sprint review' was in both the retrospective skill and the
  sprint-review agent triggers. Removed from the skill to keep the agent as the
  read-only gate and the skill as the write generator.
- **`CLAUDE.md` — remove W-shorthand from sprint cycle diagram** — the diagram
  used `W1`, `W3`, `W6`, `W7` shorthand despite the explicit convention
  prohibiting it. Replaced with spelled-out workflow references.
- **`agents/sprint-review` — fix degraded session-context references** — two
  workflow steps referenced "session context" that agents cannot access (dead
  code since the agent was created). Replaced with file-based heuristics:
  commit-message workaround detection for untracked friction, BM-timestamp
  check for `/session-reflect` suggestion. Also updated stale name
  "session-reflector agent" to current "/session-reflect skill".

### Added

- **`scripts/check-hooks.mjs` — hook integration test suite** — 17 tests
  covering all 4 hook scripts: single-JSON output verification, error
  classification, silent-exit contracts, and multi-object detection. Added
  `npm run check:hooks` to the validation pipeline. Adapted from the vp-claude
  test framework pattern.
- **`validate-plugin.mjs` — warning system** — new `warn()` function emits
  non-fatal warnings alongside errors. Prompt hooks now trigger a warning about
  Haiku's lack of MCP tool access. Also added: `VALID_HOOK_TYPES` Set,
  `VALID_EFFORT_VALUES` Set, `mcp__readwise__` MCP prefix, and optional
  validation for `paths`, `effort`, `maxTurns`, and `disallowedTools` fields.
- **`agents/sprint-review` — new frontmatter fields** — `effort: low`,
  `maxTurns: 15`, `disallowedTools: [Write, Edit]` enforce the read-only
  invariant declaratively via Claude Code v2.1.84+ runtime support.
- **All 5 skills — `paths` frontmatter field** — declares file patterns each
  skill operates on, enabling Claude Code to suggest skills based on
  file-activation signals in addition to description matching.
- **`skills/backlog-groomer` — sprint-start trigger phrases** — added 'start
  the sprint', 'plan the sprint', 'plan next sprint', 'what should we work on'.
- **`CLAUDE.md` — paths field convention** — documents the `paths` frontmatter
  field and its activation-hint semantics.

### Changed

- **`CLAUDE.md` — hook type constraint updated** — removed "known bug" language
  about PostToolUseFailure now that the conversion is complete. Added note about
  the validator's prompt-hook warning.
- **`CLAUDE.md` — validation section** — documents the new `check:hooks` step.
- **`CLAUDE.md` — BM section ownership** — workflow references use spelled-out
  form consistent with the cross-reference convention.
- **`package.json` — parallel checks via `npm-run-all2`** — `npm run check` now
  runs all 4 check stages (`check:plugin`, `check:md`, `check:sh`, `check:hooks`)
  in parallel via `run-p check:*` instead of sequential `&&` chaining.

## [0.9.2][] - 2026-03-28

### Fixed

- **`skills/synergy-tracker` — W1/W3 skip redundant sibling question** — when
  the user names a sibling project in their request, use that name directly
  instead of re-asking via registry/glob fallback.
- **`skills/synergy-tracker` — W1 step 8 first-entry guard** — skip the BM
  promotion offer when logging the very first SYNERGY entry (user is still
  learning the workflow).
- **`skills/synergy-tracker` — W1 step 2 dual-query pre-check** — BM
  pre-check now makes a second `search_notes` call with topic keywords (not
  just the sibling project name), catching engineering-pattern duplicates
  under `engineering/*` paths.
- **`agents/sprint-review` — UPSTREAM-absent noise suppression** — suppress
  "upstream tracking not set up" when SYNERGY files exist (user has chosen
  their tracking approach).
- **`UPSTREAM-beads.md` → `UPSTREAM-brew--beads.md`** — renamed to follow
  the `brew:` tool-type prefix convention. Resolved entry #2 (`bd memory
  search`) — `bd memories <keyword>` already works. Kept entry #1 (gitignore
  gap verified as real).

### Changed

- **`skills/synergy-tracker` — W2 fallback prerequisite note** — mentions
  that W3 comparison works best when the sibling repo is on disk.
- **`skills/retrospective` — Synergy observations template** — step 3
  template uses 5 structured sub-bullets (Extraction Candidates ready,
  Drifting shared patterns, Active convergence paths, New patterns logged,
  Stale entries flagged). Section is conditionally omitted when no SYNERGY
  files exist.

## [0.9.1][] - 2026-03-28

### Fixed

- **`skills/synergy-tracker` — W3 error paths tightened** — stops instead of
  speculating when no sibling context is available; adds sibling repo path
  resolution (`../<project-name>`); handles "user declines all candidates"
  and "no project identified" gracefully.
- **`skills/synergy-tracker` — edit_note gotcha cross-reference** — W1 step 8
  (eager promotion) now warns about the `append`+`section` BM bug and points
  to upstream-tracker's reference doc for the full gotcha list.
- **`skills/synergy-tracker/references/` — naming authority clarified** —
  registry `name` field is authoritative for filename derivation; `bm-entity`
  noted as v0.10.0-only; template URL fallback for missing `remote`.
- **`skills/upstream-tracker` — W6 division-of-labor: two-way → three-way** —
  now names synergy-tracker's `## Cross-Project Synergy` alongside
  upstream-tracker's `## Upstream Friction` and retrospective's `engineering/*`.
- **`hooks/session-start.sh` — commit command quoting** — remediation command
  in the sensitive-file warning now correctly quotes the `-m` argument.

### Changed

- **`skills/synergy-tracker` — structured fields table** — consolidated table
  of all entry fields (Status, Convergence path, Readiness, Priority, Effort,
  Last verified) added inline in W1, with cross-reference to the reference doc.
- **`skills/synergy-tracker` — interim W4/W5 workaround** — explicitly advises
  running W2 at every 4th-sprint boundary until W4/W5 ship in v0.10.0.
- **`skills/upstream-tracker` — synergy-tracker guard clause** — W1 step 1
  redirects sibling-project observations to `/synergy-tracker`. New scope
  boundary bullet in Guidelines.
- **`agents/sprint-review` — SYNERGY scan depth** — step 4 now also reports
  convergence-planned Divergences alongside extraction candidates. Step 5
  "Close with upstream/synergy work first" recommendation includes SYNERGY
  criteria with upstream-first ordering.
- **`skills/retrospective` — SYNERGY depth parity** — step 2 gathers all 4
  SYNERGY sections (not just extraction candidates); step 3 guideline expanded
  to ~9 lines with "review session work" prompt and explicit `(workflow 1)`
  reference; step 4 trend review now includes SYNERGY files subsection.
- **`skills/vendor-sync` — Guidelines section** — new section with division of
  labor, registry-first discovery, and annotation semantics. Step 10 report
  now mentions SYNERGY overlap.
- **`CLAUDE.md` — BM section ownership convention** — new Conventions subsection
  documenting the three-way ownership model. synergy-tracker component
  description now mentions planned `## Cross-Project Synergy` BM section.
- **`README.md`** — Plugin structure tree updated with synergy-tracker,
  upstream-tracker references, and hooks directory. "How it fits together"
  diagram updated with synergy-tracker row.

## [0.9.0][] - 2026-03-28

### Added

- **`skills/synergy-tracker` — new skill** — manages `SYNERGY-*.md` files that
  track cross-project patterns, divergences, extraction candidates, and
  capability gaps between sibling projects. Three workflows: log a synergy
  entry, review open synergies, compare with a sibling project. Permanent file
  lifecycle with `.claude/synergy-registry.json` discovery. BM integration
  (W4 trend review, W5 promote) planned for v0.10.0. Includes
  `references/synergy-entry-format.md` with entry templates, field values,
  naming convention, and registry schema.
- **`hooks/session-start.sh` — sensitive-file git-tracking warning** — checks
  if `.beads/interactions.jsonl` or `.beads/.beads-credential-key` are tracked
  by git and emits a `systemMessage` warning with remediation commands. Fires
  before the retro-count check to work in all repos.
- **`hooks/session-start.sh` — SYNERGY dormancy nudge** — when a low-activity
  repo has SYNERGY tracking files, emits a one-line systemMessage suggesting
  `/synergy-tracker` review. Parallel to the existing UPSTREAM dormancy nudge.
- **`hooks/precompact.sh` — synergy reflection item** — sixth reflection item
  prompts for cross-project extraction opportunities identified during the
  session.

### Fixed

- **`hooks/session-start.sh` — early-exit bug** — the `count -eq 0` guard
  previously exited the entire script when no RETRO files existed, suppressing
  the dormancy nudge in new repos. Restructured so dormancy nudge fires
  before the retro-count check.

### Changed

- **`agents/sprint-review` — step 4 synergy scan** — globs `SYNERGY-*.md`
  files alongside `UPSTREAM-*.md`, counts extraction candidates, flags entries
  with `Readiness: ready` and stale entries.
- **`skills/retrospective` — SYNERGY integration** — step 2 globs
  `SYNERGY-*.md` alongside `UPSTREAM-*.md`; step 3 adds "Synergy observations"
  section to the retro template with guideline; step 7 division-of-labor note
  updated to mention synergy-tracker.
- **`skills/backlog-groomer` — W1 step 5** — cross-references `SYNERGY-*.md`
  alongside `UPSTREAM-*.md` to surface extraction candidates that should have
  corresponding beads issues.
- **`hooks/hooks.json` — PostToolUseFailure context** — recovery prompt now
  mentions synergy-tracker as a Basic Memory consumer alongside upstream-tracker.
- **`CLAUDE.md`** — Plugin Layout tree, Skills (4→5), synergy tracking
  convention, synergy registry convention, sprint workflow cycle diagram updated.

## [0.8.1][] - 2026-03-27

### Fixed

- **`hooks/session-start.sh`** — guard `wc -l` pipelines with `|| count=0`
  fallbacks so `set -e` does not treat the assignment as fatal; add explicit
  `exit 0` to ensure the hook exits cleanly when no output is printed.

## [0.8.0][] - 2026-03-19

### Added

- **`skills/upstream-tracker` — "Upstream Opportunities" entry type** — new
  first-class section (`## Upstream Opportunities`) for tracking contribution
  candidates: downstream code (workarounds, extensions, enhancements) that should
  be upstreamed. New fields `Source:` (local artifact) and `Merge readiness:`
  (`direct`/`needs-redesign`/`proof-of-concept`). Distinct lifecycle from
  bugs/FRs — resolves when the contribution is merged upstream. All 7 workflows
  updated: W1 classification, W2 output format, W3 annotation branching, W4
  escalation timelines, W5 retro support, W6 promotion filter override
  (opportunities always eligible regardless of Ownership), W7 cross-project sync.
- **`skills/upstream-tracker` — eager promotion for low-activity repos** — new
  W1 step 6a detects project tempo via `git rev-list --count --since="90 days ago"
  HEAD` (dormant ≤4, moderate 5–14, active 15+). In dormant/moderate repos, W1
  offers inline BM promotion ("micro-W6") immediately after logging an entry,
  preventing entries from staying trapped locally for months. Active repos see
  no change — the normal sprint cadence handles promotion.
- **`hooks/session-start.sh` — dormancy nudge** — when a low-activity repo has
  UPSTREAM tracking files, emits a one-line systemMessage suggesting W2 review
  or W6 promotion. Silent in active repos and repos without UPSTREAM files.
- **`skills/upstream-tracker/references/` — Upstream Opportunities BM format** —
  `### Upstream Opportunities` subsection in `## Upstream Friction` entity notes
  with generalization transform rules and `edit_note` anchor guidance.
- **`hooks/precompact.sh` — contribution opportunity prompt** — fifth reflection
  item prompts for workarounds or extensions worth upstreaming.

### Changed

- **`skills/retrospective` — step 3 upstream observations** — now prompts for
  contribution opportunities built during the sprint.
- **`agents/sprint-review` — step 4 upstream scan** — counts Upstream
  Opportunities, flags `direct` readiness entries with no submitted PR.
- **`agents/sprint-review` — step 5 recommendation** — "upstream work first"
  path now includes unsubmitted contribution opportunities as sprint-ready
  actions.
- **`skills/vendor-sync` — steps 7 and 8b** — detects contribution-resolved
  events in changelog cross-reference; uses opportunity-specific BM annotation
  text.

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

[0.10.0]: https://github.com/voxpelli/claude-beads/releases/tag/v0.10.0
[0.9.2]: https://github.com/voxpelli/claude-beads/releases/tag/v0.9.2
[0.9.1]: https://github.com/voxpelli/claude-beads/releases/tag/v0.9.1
[0.9.0]: https://github.com/voxpelli/claude-beads/releases/tag/v0.9.0
[0.8.1]: https://github.com/voxpelli/claude-beads/releases/tag/v0.8.1
[0.8.0]: https://github.com/voxpelli/claude-beads/releases/tag/v0.8.0
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
