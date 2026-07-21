# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A Claude Code plugin (`vp-beads`) providing sprint workflow automation for projects
using the **`diarie` flat-YAML tracker** (`.diarie/`) and
[Basic Memory](https://github.com/basicmachines-co/basic-memory). It migrated off
[beads](https://github.com/steveyegge/beads) — see `## The tracker migration`. These skills
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
  sibling-sync/SKILL.md               # Bilateral SYNERGY/UPSTREAM reconciliation between siblings
plugins/
  diarie-adopt/
    skills/
      migrate-tracker/SKILL.md        # Guided bd → flat-YAML cutover (for other repos)
      deintegrate-beads/SKILL.md      # Disarm bd's machinery post-migration (never deletes data)
    scripts/
      beads-probe.mjs                 # Read-only beads reconnaissance probe
      check-beads-probe.mjs           # Unit tests for the probe
  swarm-wave/...
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
hooks/
  hooks.json                          # Hook definitions (3 event types)
  session-start.sh                    # Tracker prime (startup) + compaction recovery (source=compact) + sensitive-file warning, dormancy nudge, trend-review reminder
  post-file-edit.sh                   # Auto-format hooks/*.sh and scripts/*.sh with shfmt
  post-tasks-validate.sh              # Validate .diarie/tasks/ on edit; report errors, silent when clean
  post-bm-failure-classify.sh         # Basic Memory error classification + recovery guidance
CLAUDE.md
README.md
CHANGELOG.md
```

No application code — skills are pure markdown, hooks are shell scripts.
Dev tooling only: validation and linting via `npm run check`.

## Components

### Skills (8)

- **migrate-tracker** — Guided, one-way cutover of a project's issue tracker off
  beads (`bd`) onto the flat-YAML tracker. Five workflows: detect-and-assess,
  export-and-archive, migrate (dry-run first), verify (validate + a dual-run
  against `bd ready`), cut-over. Wraps the `diarie migrate` CLI (the
  generalized migrator, extracted to `voxpelli/diarie`). Aimed at *other* repos
  — vp-beads already migrated; the
  siblings (vp-knowledge, vp-git) broke on the same global beads 1.1.0 binary.
  User-invocable as `/migrate-tracker`.
- **deintegrate-beads** — De-integrates beads *after* the migration is trusted. Five
  workflows: probe-verify-confirm, disarm-git-hooks, stop-daemon, de-colonize
  (CLAUDE.md/AGENTS.md blocks + Claude hooks + bd perms), report-what-is-left.
  **The hooks are disarmed BEFORE the daemon is stopped** — the armed `pre-commit`
  shim calls `bd`, which re-spawns the daemon, so stopping it first just brings it
  back on the next commit. **Never deletes `.beads/` or any data** — it disarms
  machinery (bd hides five git hooks behind `core.hooksPath`, so `.git/hooks/` looks
  clean while every commit routes through `bd`) and reports the rest. All detection
  lives in the tested `scripts/beads-probe.mjs` (inside the `plugins/diarie-adopt/`
  plugin), not in prose. User-invocable as `/deintegrate-beads`.
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
  conflicts (always accept upstream), cleans stale node\_modules, re-links
  workspaces, cross-references the sync diff against open `UPSTREAM-*.md`
  entries to auto-resolve fixed issues, annotates corresponding Basic Memory
  friction entries on resolution, and verifies with check + test.
  Reads the subtree registry from `.claude/vendor-registry.json`. User-invocable
  as `/vendor-sync`.
- **sibling-sync** — Bilateral reconciliation of `SYNERGY-*.md` and
  `UPSTREAM-*.md` files between this project and its registered sibling
  vp-\* projects. Four workflows: discover-siblings (registry resolution +
  path probing), sync-sibling-synergy (reciprocal gaps, stale alignment
  claims, divergence convergence-status drift), sync-sibling-upstream
  (two pairing modes — Mode A: shared-dependency basename intersection
  surfacing duplicate friction, complementary workarounds, sibling-only
  entries; Mode B: reciprocal sibling-friction pairs `UPSTREAM-<sibling>.md`
  here ↔ `UPSTREAM-<this-project>.md` there, surfacing friction the sibling tracks
  about us, our open friction against them, and cross-side staleness from
  shipped fixes), apply-reciprocation-batch (opt-in `--auto-reciprocate`
  flag, per-entry confirmation, writes only to the sibling side; SYNERGY
  finding (a) only — never UPSTREAM). Read-only by default. Workflows 2
  (Sync sibling SYNERGY) and 3 (Sync sibling UPSTREAM) end with a
  per-sibling two-tier action menu (single `AskUserQuestion` call,
  `header: "Synergy"` + `header: "Upstream"`) that delegates writes to
  `/vp-beads:synergy-tracker`, `/vp-beads:upstream-tracker`, or a task row appended
  to `.diarie/tasks/` via the `Skill` tool — replacing the previous copy-paste hint workflow.
  Distinct from `/vendor-sync` (upstream → project drift, subtree pulls)
  and `/synergy-tracker` (logging entries here on this side); sibling-sync
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
  utility), research-wave (parallel research with direct `.diarie/` task creation).
  Manages ephemeral `SWARM-NN.md` files. User-invocable as `/swarm-wave`.

## The tracker migration: bd → flat-YAML (done)

This project **has migrated off beads.** Its work lives in a lean in-repo flat-YAML
substrate — `.diarie/tasks/tasks-<slug>.yml`, read by `diarie ready` (the files-native
`bd ready`) and validated by `diarie validate`. The canonical schema lives in the external
`diarie` package's `lib/schema.js` (the `TRACKER_DIR` authority).

The tracker is a real CLI, **`diarie`**, with `ready` / `stats` / `validate` / `init` /
`migrate`. It is **published** (`diarie@0.2.0` on npm, 2026-07-18; `diarie.dev` registered).
Here it resolves via `npx diarie` / `node_modules/.bin/diarie` — **bare-shell `diarie` is
NOT on PATH** (only npm injects it). Everything calls the CLI; there are no loose `.mjs`
readers left.

Verdict from a 12-agent research round (2026-06-09), for provenance:
`RESEARCH-tracker-migration-synthesis-2026-06.md`; architecture in
`DESIGN-tracker-exploration.md` (v3 block). **Backlog.md was evaluated and
DECLINED** — its MCP server is another daemon/vendor, and it cannot reproduce
`ready`. There is no Backlog.md MCP server here; its superseded dogfood lives in
`.diarie/_archive/` for provenance.

- **The forcing function:** beads 1.1.0's schema-migration gate **panics on every
  write**, in every repo using the global binary. `bd` reads still work; `bd` writes
  are dead and are not used.
- **What shipped:** the read/validate tooling and canonical schema (Phase 0); the
  data cutover of 24 live issues, with the full 131-issue export frozen to
  `.diarie/_archive/bd-final-export.jsonl` (Wave 1); the retarget of every skill,
  the agent, and the hooks off `bd`, plus `### Beads-availability convention` →
  `### Files-availability convention` and the drop of `/harden-memories` (Wave 2 /
  `vp-beads-e42`).
- **What is left of bd:** `.beads/` remains on disk as a frozen, readable archive.
  Its *machinery* — five git hooks hidden behind `core.hooksPath`, a Dolt daemon —
  is what `/deintegrate-beads` disarms. Residual `bd` mentions in skill prose are
  intentional (Integration Charter citations, and mapping explainers like "the
  files-native `bd ready`").
- Feature branch `feat/tracker-design-exploration` carries this work (local-only per
  user choice — don't push without approval). **Extracted + externalized 2026-07-18:**
  diarie was `git subtree split`'d to its own repo
  [`voxpelli/diarie`](https://github.com/voxpelli/diarie) (its canonical home), then wired
  here as a **`file:../diarie` dependency** (`85600aa`) — the in-repo `diarie/` workspace is
  **gone**. Published 2026-07-18 (`diarie@0.2.0` on npm); the `file:../diarie` bridge has since been
  flipped to the published `^0.2.0` dep.

## Work-tracking substrates

vp-beads supports three work-tracking substrates and **forces none of them**.
How each component degrades when the tracker is absent is defined once by the
`### Files-availability convention` below (tiers A/B/C) — this section describes
the substrates themselves, not the per-skill behavior (no per-skill tier table
lives here or in the README; it would duplicate and rot).

- **The flat-YAML tracker** (`.diarie/tasks/tasks-<slug>.yml`) — the default and
  richest substrate (typed items, dependencies, priorities, an integrity gate).
  Detected by the canonical predicate in `### Files-availability convention`.
  **beads is no longer a substrate** — it was replaced, not demoted (its 1.1.0
  writes are dead).
- **`ROADMAP.md`** — a work plan **in whatever structure the project already
  uses**. swarm-wave reads it in its own idiom and **never prescribes a format
  or rewrites the file** (the `substrate-not-opinion` principle); it declines
  cleanly when the file is not a parallelizable work plan. The interpretation
  contract lives in `skills/swarm-wave/references/roadmap-interpretation.md`.
- **`VISION.md`** — direction and voice, **not** a backlog. Never a work source.

A manually supplied work list is the fourth, file-less option swarm-wave
accepts. Creating and claiming/closing items requires the flat-YAML store; a
trackerless wave uses the `SWARM-NN.md` Item Status table as run-state.

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

### Files-availability convention

vp-beads must **not force its flat-YAML tracker**. Every skill detects
availability and degrade along a defined tier — **silently skipping a tracker step
is a bug**: it makes a project that tracks its work elsewhere look like a broken
one. Hooks are **exempt** — a hook's silent fallback (e.g. `session-start.sh`
omitting the in-progress claim from its compaction-recovery snapshot when no
tracker files exist) is recovery plumbing, not a user-facing workflow step.

**Detection predicate (canonical).** The flat-YAML tracker is available for a
project iff a `.diarie/tasks/tasks-*.yml` file exists **and** the `diarie` CLI is
runnable. Both conditions, checked every time — neither alone. Unlike the old
`.beads/` + `bd` binary, these are ordinary committed files plus a small pure reader
— no daemon, no vendor.

**A missing store is an ERROR, not an empty backlog (`ENOSTORE`).** Pointed at a
project with no `.diarie/`, `diarie` exits non-zero and emits
`{"error": "...", "code": "ENOSTORE"}` on **stdout**. It does *not* print an empty
result. This is what makes the predicate above enforceable rather than decorative: a
component can now tell "this project tracks its work elsewhere" apart from "this
project has no work left", which are opposite situations that used to look identical.
An **empty but present** store is a legitimate answer and exits 0.

Two consequences, and they bind every component below:

- **Ask for `--json`, and never discard stderr.** Without `--json` the error goes to
  stderr; a `2>/dev/null` therefore turns ENOSTORE back into silence and re-opens the
  exact defect. With `--json` it lands on stdout with a machine-readable `code`.
- **Handle ENOSTORE explicitly.** Reporting an absent tracker as an empty backlog is
  the original bug wearing a skill's clothes, and nothing fails when you get it wrong
  — which is precisely why it must be written down.

**Tiers.**

- **Tier A — require-or-fallback.** The component needs a work source but not the
  *flat-YAML tracker specifically*: use `.diarie/tasks/` when available, else fall
  back to another source (`ROADMAP.md`, or a manual list) and only stop when no
  source can be obtained. Components: `swarm-wave` (workflow 1 (Plan a swarm sprint)).
- **Tier B — tracker-specific.** The component operates directly on the flat-YAML
  store: it reads via `diarie` and writes with Edit/Write on `.diarie/tasks/`. Two
  outcomes, and **they are not the same thing**:
  - **Store present but empty** → an empty backlog. A real, ordinary answer; carry on.
  - **Store absent (`ENOSTORE`)** → **redirect, do not proceed.** This project tracks
    its work somewhere else, so point at the right tool
    (`/swarm-wave` / `ROADMAP.md`). Do **not** report it as an empty backlog.

  This entry used to read *"an absent-or-empty store is simply an empty backlog"* — the
  conflation `ENOSTORE` exists to delete. Tier B has no *stop* in the old beads sense
  (the store is ordinary files, not a daemon that can be down), but it does have a
  branch, and taking the wrong one tells a user with a healthy `ROADMAP.md` that their
  backlog is empty. (Tier B is defined for reference; no active component currently
  occupies it — the former occupant `backlog-groomer` was retired per P1.4.)
- **Tier C — degrade-and-announce.** The component does useful non-tracker work
  too; when the tracker is absent it runs the rest and **announces** each skipped
  tracker step (never skips it silently). Components: `retrospective`.
- **Exempt — the tracker's state IS the precondition, not a degradation.** Two
  skills, both structural, both inverses of a tier: `migrate-tracker` *creates* the
  store (requires `.beads/` present, `.diarie/tasks/` **absent**, and stops when it
  finds a store already there); `deintegrate-beads` runs after it (requires
  `.diarie/tasks/` present **and committed**, plus `.beads/` present, and stops
  otherwise). Tiering either would invert its meaning. These are the only
  exemptions — do not add more to dodge a tier.

**Canonical inline sentence (copy verbatim; change only the tier letter).** Each
component opens its availability handling with:

> The flat-YAML tracker is available iff a `.diarie/tasks/tasks-*.yml` file exists
> **and** the `diarie` CLI is runnable; a missing store is an **error**
> (`ENOSTORE`, non-zero exit), never an empty backlog. This component is **Tier `X`**
> per CLAUDE.md `### Files-availability convention`.

The tier→component mapping lives **only here**. Components cite their tier letter
and link back — they do not restate this table (it would duplicate and rot, like
the per-skill tables this section deliberately omits).

### Reader conventions — a guard that DROPS must also REPORT

A general lesson this repo earned, worth applying to any guard in vp-beads' own scripts: **a guard
that rejects a value must also report it, naming the CONSEQUENCE** — not `invalid priority`, but
*"invalid priority `urgent` — treated as `medium`"*; and **represent a malformed row, never silently
drop it** (dropping hides the typo from the human; a missing-or-invalid *required* field makes a row
BROKEN and surfaced for attention, not merely non-workable). The concrete
`loadTasks`/`computeReady`/`needsAttention` implementation that earned this now lives in the external
**[`diarie` repo](https://github.com/voxpelli/diarie)** — it is that repo's engineering guidance, not
vp-beads'.

### Retrospective file convention

- Named `RETRO-NN.md` in the project root
- Sprint number increments by 1 from the highest existing number
- Every 4th sprint triggers a full trend review (UPSTREAM files, tracker hygiene,
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
  whose `name` is not in the base registry are handled in two modes: (a) if the
  entry's `file` is a `PRIVATE-SYNERGY-<name>.md` value it is **added** as a
  private sibling (see next bullet); (b) otherwise it is ignored
  (backward-compatible — the base registry is the authoritative source of
  *public* siblings). Used by synergy-tracker workflow 3 (Compare with sibling)
  and `/sibling-sync`. Never committed — encodes machine-specific paths and
  private relationships.
- **Private (local-only) sibling registration**: a sibling whose existence must
  not be committed (e.g. a proprietary open-core partner) is registered
  **exclusively** in `.claude/synergy-registry.local.json` with `file` set to a
  `PRIVATE-SYNERGY-<name>.md` value. The `PRIVATE-` prefix is the marker — there
  is no boolean. It reuses the same prefix mechanism as the private *content*
  overlay (next bullet), so one convention covers both. **No-commit-leak
  invariant** (the private `name` lives only in the gitignored `.local.json` and
  `PRIVATE-SYNERGY-<name>.md`; it must never reach a committed file): the
  committed base registry must never contain a `PRIVATE-SYNERGY-*` entry
  (`validate-plugin.mjs` errors); `.gitignore` uses the wildcards
  `PRIVATE-SYNERGY-*.md` + `.claude/*.local.json` and never a per-name line
  (the validator flags a literal one); `bm-entity` is omitted; BM promotion and
  reciprocation are skipped for `PRIVATE-SYNERGY-*`-filed siblings (structural);
  the action menu suppresses task creation for private-sibling findings; and
  follow-up logging redirects to the gitignored `PRIVATE-SYNERGY-<name>.md`.
  `/sibling-sync` **may read** a private sibling's `PRIVATE-SYNERGY-<name>.md`
  for read-only diff (it is a registry `file` value), but never writes the name
  to any committed surface. UPSTREAM Mode-B reciprocal-friction is out of scope
  for private siblings (would need a `PRIVATE-UPSTREAM-` mechanism) — private
  siblings are SYNERGY-only. This is the *registration*-layer counterpart to the
  private content overlay below (which makes individual *entries* private within
  an already-registered public sibling).
- **Private overlay file: `PRIVATE-SYNERGY-<project-name>.md`** — a gitignored
  companion to the committed `SYNERGY-<project-name>.md`, for synergy entries
  that must stay out of a public repo (a proprietary sibling's internal paths,
  client names, unreleased plans). **The `PRIVATE-` prefix is load-bearing: it
  keeps the overlay OUTSIDE the `SYNERGY-*.md` glob namespace, so every public
  consumer (`/retrospective`, `session-start`, promotion,
  reciprocation) structurally cannot read it** — the privacy invariant is a
  filesystem fact, not a per-consumer exclusion rule. Gitignored via the
  explicit `PRIVATE-SYNERGY-*.md` line (prefix-namespaced like `RETRO-*` /
  `SWARM-*`); `session-start.sh` warns if any `PRIVATE-SYNERGY-*.md` is tracked.
  Merge semantics: the overlay holds additional private entries under the same
  four section headings. Only a deliberate *local-only* read (synergy-tracker
  workflow 2 (Review)) globs BOTH `SYNERGY-*.md` and `PRIVATE-SYNERGY-*.md` to
  assemble the combined view (private rows labelled `[local]`); every other
  read uses `SYNERGY-*.md` and never sees private entries. **Invariant:
  private-overlay entries are NEVER promoted to Basic Memory and NEVER
  reciprocated/written to a sibling.** When a `PRIVATE-SYNERGY-*.md` overlay
  exists **for a registered public sibling**, the committed
  `SYNERGY-<project-name>.md` carries a one-line pointer noting it (gitignored
  files are invisible to collaborators and `git grep`). A **fully-private
  sibling** (registered only in `.local.json` per the bullet above) has **no**
  committed `SYNERGY-<name>.md` and therefore **no pointer** — a pointer would
  commit the private name. This *content* overlay is owned by synergy-tracker;
  `/sibling-sync` never reads a glob-discovered overlay of a public sibling. The
  one exception is a *private sibling* whose registry `file` IS a
  `PRIVATE-SYNERGY-<name>.md` value: `/sibling-sync` may read that file for
  read-only diff (it is the sibling's sole synergy content), but still never
  writes the private name to any committed surface.

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

The agent and skills form a lightweight cycle. The diagram below shows the
**tracker-backed** path (this repository's own setup); without the flat-YAML store
the same cycle runs with the per-tier degradations from `### Files-availability
convention` (swarm-wave sources from a `ROADMAP.md` or a manual list,
`/retrospective` announces skipped tracker steps).

```
(sprint start)
diarie ready → triage backlog, edit .diarie/ YAML directly
  ↓ then
swarm-wave (skill)        → plan waves, execute with parallel agents   [optional]
  ↓ or                        (workflow 1 (Plan) plans, workflows 2 (Execute) + 3 (Gate) loop per wave)
diarie ready → normal development cycle

(sprint end)
user reviews open work     → close completed tasks in .diarie/tasks/
  ↓ then
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

`/retrospective` is the *generator* (user-invoked, writes files). Basic Memory
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

### Issue tracking (flat-YAML — post-bd)

**Scope: this repository's own development.** This is a self-instruction for
working *on vp-beads*, not a claim about projects that *use* vp-beads — the
plugin supports multiple substrates (see `## Work-tracking substrates`).

This project tracks its own work in the **flat-YAML substrate**, **not bd** (see
`## The tracker migration` above; do not use `bd` — its 1.1.0 writes are dead).

**diarie is EXTERNAL** — extracted to its own repo, [`voxpelli/diarie`](https://github.com/voxpelli/diarie)
(the canonical home for diarie's own development, backlog, and decisions), and consumed here as a
published npm dependency (**`diarie@^0.2.0`**; externalized via `file:../diarie` in `85600aa`, then
flipped to npm once published). The in-repo `diarie/` workspace is **gone**, so there is
now **one store**: root `.diarie/` = this plugin's own work (`vp-beads-*`). Invoke via `npx diarie` /
`node_modules/.bin/diarie` — bare-shell `diarie` is NOT on PATH. **Edit diarie's own backlog in
[`voxpelli/diarie`](https://github.com/voxpelli/diarie), not here.**

```bash
diarie ready      # what to work on   [--json] [--blocked] [--filter <status>] [--strict]
diarie stats      # counts + stale claims   [--json] [--stale] [--days <n>]
diarie validate   # the integrity gate — run after EVERY edit   [--json]
```

Claim / complete by **editing the YAML directly** in `.diarie/tasks/tasks-<slug>.yml` —
`status: in_progress` (+ `agent:`) to claim, `status: completed` to close. There is no CRUD
helper, deliberately (substrate-not-opinion — the write side is Edit/Write). Decisions live
as markdown in `.diarie/decisions/`.

**Use Claude Code's built-in task tracker too — for the session's steps.** It and `diarie`
are different time horizons, not rivals (decision `vp-beads-tdo`):

> **An ephemeral todo may never be the ONLY home of a commitment.** If it must outlive the
> session, it is a `diarie` row.

So: `diarie ready` → claim a row → expand it into built-in todos → work → close the row. The
todo list is one claimed row's execution made visible; it is **never a second backlog**.

### Sub-agent permissions in Task-tool launches

Sub-agents launched via the Task tool **don't inherit `permissions.allow`
rules from USER-level `~/.claude/settings.json`** — only PROJECT-level
permissions (`.claude/settings.local.json` etc.) inherit. Per
`anthropics/claude-code#18950` (cluster: #25000, #27661, #34315). Symptom:
Bash patterns or `mcp__*` tool names pre-listed at user-scope are silently
denied in sub-agent context, even though main-thread (which sees both
scopes + has interactive UX) succeeds. **Confirmed 2026-05** in this project.

**MCP twist:** locally-registered MCP servers ARE discoverable from
sub-agents (ToolSearch finds their schemas), but each `mcp__<server>__*`
tool name must ALSO be in project-level `permissions.allow` to be
callable — add each tool name to `.claude/settings.local.json`. (Option C uses
no MCP server, so this no longer applies to task tracking; it remains true for
any other locally-registered MCP server a sub-agent must call.)

**Workaround pattern (in order):**

1. Run `/fewer-permission-prompts` — scans recent transcripts and
   writes a baseline allow-list to project-scope `.claude/settings.json`
   (correct scope for sub-agent inheritance).
2. Hand-curate `.claude/settings.local.json` for anticipated new
   operations the sub-agent will need but haven't appeared in
   transcripts yet (new MCP tools, novel Bash patterns).
3. Main-thread takeover as fallback for one-offs.

**Skip these (wrong layer / scope):**

- `allowed-tools` frontmatter — only applies to named agents at
  `.claude/agents/<name>.md`, not Task-tool launches.
- `dangerouslyDisableSandbox: true` — targets the OS sandbox
  (Seatbelt/bubblewrap, off by default per `/sandbox` opt-in); wrong
  layer entirely.

**Known bug:** `anthropics/claude-code#51057` — `/fewer-permission-prompts`
silently drops env-var-prefixed commands (`FOO=bar npm test`), so the
generated rule fails for sub-agents that need such patterns; hand-curate
those explicitly. Concrete starter snippet for `.claude/settings.local.json`
when running swarm-wave (add any `mcp__<server>__*` tools a sub-agent must call):

```json
"Bash(diarie:*)", "Bash(npx:*)", "Bash(gh api:*)", "Bash(brew info:*)"
```

Full details + 5-agent validation trail: BM
`engineering/agents/parallel-agent-orchestration-lessons` last `[gotcha]`
observation + `UPSTREAM-claude-code.md` at project root.

### Issue types

**Four exclusive types** (decision `vp-beads-etm`), enforced by `diarie validate` (the
`VALID_TYPES` set, defined in the external `diarie` package's schema):

| Type        | Lives in                     | When to use                                                                                     |
| ----------- | ---------------------------- | ----------------------------------------------------------------------------------------------- |
| `task`      | `.diarie/tasks/tasks-*.yml`  | A unit of work. **The only type the ready-walk surfaces.**                                       |
| `decision`  | `.diarie/decisions/<id>.md`  | An architectural or product choice, with its reasoning. Stays open indefinitely — never "ready". |
| `doc`       | `.diarie/docs/<id>.md`       | Reference prose. Nothing in bd mapped to this, so migrations never produce one.                  |
| `milestone` | `.diarie/tasks/tasks-*.yml`  | A structural marker (`v1.0`, `public-alpha`). No effort, no assignment.                          |

**The type is exclusive; the framing is additive.** bd's other five types are
*framings* of a task and ride in `labels:` — `bug`/`feature`/`chore`/`story`/`spike`
→ `task` + `labels: [<framing>]`. An `epic` is `task` + `parent:` nesting (plus an
`epic` label). This is the whole point of collapsing 9 → 4: a type answers "what
kind of thing is this", which admits exactly one answer; a label answers "how should
I think about it", which admits several.

`decision` and `doc` carry prose, which a terse YAML row has no home for — hence the
markdown files, with the schema fields in frontmatter. Because `diarie ready` only
globs `tasks-*.yml`, they are structurally outside the ready computation: a decision
in force is never surfaced as workable. (bd got this wrong — its ready-walk is
type-blind and lists decisions as ready. Our own dual-run caught it on `vp-beads-etm`.)

bd's 9-type vocabulary survives only in the frozen
`.diarie/_archive/bd-final-export.jsonl`; the `TYPE_MAP` that reads it is diarie's migrate
internals, in the external [`diarie` repo](https://github.com/voxpelli/diarie).

### Session completion

Work is NOT complete until pushed. Before ending a session:

1. Close finished work in `.diarie/tasks/` — set `status: completed` on the row
   (and add `acceptance_criteria` if the task shipped without any)
2. `diarie validate` — the store must be clean
3. `npm run check` (if code changed)
4. `git push` — mandatory, never skip

There is no separate tracker sync: the store *is* the repo, so `git push` ships it.

### Do not run `bd setup claude`

`bd setup claude --check` will report `✗ No hooks installed` — this is
intentional. Do not "fix" it.

**What it would actually do** (bd 1.1.0, verified): write `SessionStart` and
`PreCompact` hook entries running `bd prime` into `.claude/settings.json`, and — in
older versions — a managed block into `CLAUDE.md`. That is precisely the
colonization `/deintegrate-beads` exists to *undo*. Do not re-invite it.

It is also pointless now: `bd`'s writes are dead (the 1.1.0 migrate gate) and this
repo's tracker is flat-YAML. The orientation `bd prime` used to give is now
`hooks/session-start.sh`'s **tracker prime**, which reads `.diarie/` directly.

*(Historical correction, since this section was wrong for a while and the wrongness
was load-bearing: the ~1.5k-token `bd prime` injection came from the **external
beads plugin**, never from vp-beads' own hook. Until the tracker prime shipped
2026-07-11, this plugin's SessionStart hook injected **no** tracker context at all —
so the old claim that it "already injects equivalent workflow context plus all
persistent memories" was false in both halves.)*

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

`check` = **`run-p check:* && run-s check-workspaces`** (`npm-run-all2`): every `check:*` key in
parallel, THEN the workspace delegation. `check-workspaces` is hyphenated ON PURPOSE — `run-p
check:*` matches only `check:`-prefixed keys, so the hyphen keeps the delegation out of the
parallel glob and runs it as an explicit sequential step (turning the single-segment-glob gotcha
below into a feature). The `&&` is deliberate **fail-fast** — the cheap root `check:*` batch gates
the expensive workspace suite ("own gates before children"). Do NOT "fix" it into
`--continue-on-error` to see all failures at once: the gate still reddens on ANY failure and
nothing broken ships, so that is a preference (comprehensive CI reporting), not a bug. The
authoritative list is the keys in `package.json`, not this paragraph.

**THE WORKSPACE OWNS ITS GATES; THE ROOT DELEGATES.** The root's `check:*` keys cover
the **plugin only** — `check:plugin` (validate-plugin.mjs) + `check:validator`,
`check:md` (remark), `check:lint` (eslint), `check:sh` (shellcheck + shfmt),
`check:ast-grep` + `check:ast-grep-test`, `check:hooks`, `check:beads-probe`, and
`check:tasks` (`diarie validate` — validating *this repo's own store* via the installed
diarie binary, not the package). **`check-workspaces` = `npm run check --workspaces
--if-present`** delegates to every workspace under the `plugins/*` glob — each owns its own `check` aggregate.
Workspace members today: `plugins/swarm-wave` (wave orchestration) and
`plugins/diarie-adopt` (migration tooling) — each owns its own `check:` aggregate that the root
delegates to. **diarie is NOT a workspace** — it is an external npm dependency (`diarie@^0.2.0`)
and owns all its own gates in its own repo.

🚨 **`run-p check:*` does NOT match a `test` key.** A workspace's tests reach the aggregate ONLY if
exposed under a **`check:`-prefixed** script (e.g. `check:test`) — `run-p check:*` never matches a
bare `test` key, and CI runs only `npm run check` (the root has no `test` script). This once left
diarie's entire 228-assertion suite running **nowhere** — green over a suite nobody executed. So when
you add a `plugins/*` workspace, give its tests a `check:`-prefixed key and **prove it by planting a
failing test and watching the ROOT go red.**

**Own gates travel with their workspace — that is the whole point.** diarie's extraction was a no-op
precisely because its lint/tsc/type-coverage/knip/ast-grep/tests already lived in *its* `package.json`,
not reached in from the root through a path or glob. The same discipline holds for `plugins/*`: the
root's `check:*` keys cover the **plugin only**; a workspace the root lints too (two configs that can
drift) is a workspace that cannot be extracted cleanly.
All checks must pass before committing. Remark uses `--frail` so warnings are errors.
Requires `shellcheck` and `shfmt` (`brew install shellcheck shfmt`); `ast-grep`
comes from the pinned `@ast-grep/cli` devDep.

`validate-plugin.mjs` includes a tool-reference audit: any `mcp__*__*` tool
pattern mentioned in skill/agent prose but missing from the `allowed-tools` or
`tools` frontmatter will fail validation. This catches the most common bug class
in this plugin (missing `allowed-tools` entries).

### Doc-grep the VOCABULARY, not just the command name

The global CLAUDE.md already requires a doc-grep before any feature-removal, rename, or
guidance-correction plan. Sprint 16 found the hole in it: **a sweep targeting command names is
structurally blind to DATA vocabulary.**

`git grep ready-walker` finds every invocation. It finds **nothing** about `priority: 2`,
`status: closed`, or a scalar where the schema wants a list — the *enum values, field shapes
and status names of the substrate you just replaced*. Those are the fossils, and they hide in
the write paths.

What survived a sweep described in its own commit as complete:

- `/retrospective`'s task template emitted `priority: 2` (bd's 0–4 numeric scheme) and a string
  `acceptance_criteria` — **both HARD ERRORS**, in the skill's *primary write path*, which then
  told you to run the very gate that rejects them.
- `status: closed` — a status that does not exist in `VALID_STATUSES` at all, which made the
  surrounding blocked-review conditional **dead code that could never fire**.

So on a substrate swap, grep **both**: the commands (`ready-walker`, `--format json`) *and* the
values (`priority: [0-9]`, `status: closed`, every retired enum member). The commands are what
the sweep sees; the values are what it misses.

### check:prose-commands — the prose is now checked (vp-beads-vcb)

This plugin is mostly prose, and its prose is executable instructions; nothing verified those
commands exist, so Sprint 16 shipped a dead one into every session (`node
scripts/ready-walker.mjs`, deleted two commits earlier) green the whole way.
`scripts/check-prose-commands.mjs` (`check:prose-commands`) closes that gap: it pulls every
`diarie <sub> [--flags]` and `node <path>` invocation out of the five prose surfaces (`hooks/`,
`skills/`, `agents/`, `CLAUDE.md`, `README.md` — **not** `scripts/`) and resolves each against the
**real binary** — subcommands from `diarie --help`, flags from `diarie <sub> --help`. There is no
hardcoded flag table; a second model of the CLI is the exact failure this check exists to prevent.

**Imperative vs mention** is the hard half, and three rules do it: (1) *span-atomicity* — each inline
code span and each fenced/heredoc command line is one atomic candidate, so `` (`ready-walker`,
`--format json`) `` is two spans, the `ready-walker` one bare; (2) *first-token executable* — in
`git grep ready-walker` the executable is `git`, so `ready-walker` is an argument, not an invocation;
(3) *exact-token* — `check-ready-walker` ≠ `ready-walker`. A bare executable is a noun and is skipped.
That is what keeps the dozen descriptive `ready-walker` / `validate-tasks` mentions green.

**Escape hatch:** a line carrying the marker `prose-cmd-ignore` has its candidates skipped — for a
lesson that must quote a literal broken command (`plugins/diarie-adopt/skills/migrate-tracker/SKILL.md` does). It is the
eslint-disable pressure valve, greppable, so a real teaching example never forces the check off.

**Editing caveat:** a `node <path>` or `diarie <sub>` you write in prose (here, in a skill, in the
README) is resolved against the REAL repo-root binary — a `node` path that only lives under
`diarie/` (not the repo root), or a flag on the wrong subcommand, fails the check. Reword, use the
real command, or mark the line `prose-cmd-ignore`.

**Self-test first:** a prose-check that classifies everything as a mention would scan, find nothing,
and pass — inert and green, this repo's signature failure. So it reproduces a frozen ground-truth of
synthetic reds *and* greens before it is trusted on the corpus; if it cannot go red on a planted
fossil it fails before scanning. `migrate`'s hand-written help is read like any other; `vp-beads-mig`'s
USAGE⇔parser test is what keeps that help honest for the oracle to trust.

### ast-grep structural lint

**ONE config, a bare scan — standard tooling, no wrapper.** The root's `sgconfig.yml` →
`.ast-grep/` guards the **plugin**: `check:ast-grep` is a plain **`ast-grep scan`** (in CI,
`--format github` for inline annotations) and `fix:ast-grep` is `ast-grep scan --update-all`.
There is **no path list and no runner script** — a bare scan walks the whole repo,
gitignore-bounded, so a rule can never be scoped outside a list a runner forgot to update. Under
the shared-root-config model (decision `vp-beads-cst`, option I) that one scan also covers every
`plugins/*` workspace — no per-plugin ast-grep copies. To add a rule, write the rule + its
rule-test and run `ast-grep test --update-all` to seed the snapshot.

*(History, 2026-07-18: the root once carried `scripts/check-ast-grep.mjs` over a
`scripts/ast-grep-paths.mjs` path list, plus an existence-guard and a `scannedFileCount` FLOOR —
all to exclude an in-repo `diarie/` workspace (which carried its own config) from a bare scan.
diarie is an external npm dependency (`diarie@^0.2.0`), so the exclusion is moot and the whole
apparatus was deleted for standard `ast-grep scan`. The plugin does **not** floor-guard the
scan's file count: a broad `.gitignore` line can shrink a bare scan, but that risk is accepted
**at parity with every other ignore-bounded gate** — `check:md` is `remark --ignore-path
.gitignore`, equally blindable — rather than met with bespoke tooling for ast-grep alone.)*

**diarie's own rules travelled with it** to `voxpelli/diarie` (its `sgconfig.yml` + `.ast-grep/`,
including four rules of its own — `no-identical-test-title`, `no-unsanctioned-exit-2`,
`no-computed-exit-code`, and its half of `no-hardcoded-tracker-dir`). `sgconfig.yml` has **no
`extends`/`include`** — no config inheritance — so a rule needed on both sides is a knowing COPY,
not a share.

The plugin's rules (6): `no-jsdoc-any-type` (prefer `unknown` + a guard — **advisory, not a
ratchet**), `no-jsdoc-object-typedef` (auto-fixable), `no-commonjs-require`,
`no-identifier-shadow-call`, `no-jq-raw-interpolation` (the hooks build jq programs — and the bare
scan now points it at the real `hooks/*.sh`, which the old path list once forgot to include,
`vp-beads-agr`), plus **`no-hardcoded-tracker-dir`**. The last is CROSS-BOUNDARY: the tracker path
segment lives *only* in `TRACKER_DIR` (`diarie/schema`), and this copy guards the plugin's
`scripts/*.mjs` + `validate-plugin.mjs`, which import it precisely because this rule makes them —
it matters most in guard code, where a hardcoded segment would not *error* after a rename, it
would silently stop guarding. Deliberately NOT adopted: vp-claude's `bash-require-set-euo-pipefail`
— a hook that aborts on any failing command *blocks the tool call*, and these hooks must degrade
quietly.

🚨 **`ast-grep test` does not fail on an untested rule — it SKIPS it, and the pairing key is the
`id:` FIELD, not the filename.** Both measured. Delete a rule's test file and it prints
`ok. 7 passed; 0 failed` and **exits 0**, going from 8 rules to 7 without ever naming the one it
dropped. Change *only* the `id:` inside a test file — leave the filename correct — and it prints
`Configuration not found! <id>` and **still exits 0**, while the rule silently has no test at all.
`check:rule-parity` asserts all three (the file exists, its `id:` names the rule, it has an
`invalid:` case), because a checker that pairs by *filename* reports success over exactly this.

🚨 **The bare scan is bounded by `.gitignore` — and ast-grep only honours `.gitignore` INSIDE a git
repository.** Measured: with no `.git`, an ignored file **is scanned**; after a bare `git init` (no
commit, no `add`), it is skipped; and ast-grep **skips a TRACKED-but-ignored file**. So the root
`.gitignore` is load-bearing for the *lint*, not only for git: it is what keeps the bare scan off
`node_modules` (a scan that walked it would report ~25k errors from other people's code).

**That ignore-bound is a known, accepted risk, deliberately un-guarded.** One broad ignore line
(`dist/`, `lib/generated/`) shrinks lint coverage with nothing going red — `ast-grep scan` exits 0
over an empty set. The plugin does **not** meet that with a `scannedFileCount` floor (an earlier
`vp-beads-flr` floor did; diarie still floors its own scan in its own repo). A blindable
ignore-bound is the same risk `check:md` carries as `remark --ignore-path .gitignore`, so it is
accepted uniformly rather than singled out for bespoke tooling — see the History note above and
`UPSTREAM-ast-grep--cli.md` for the `--min-files`/`--error-on-empty` gap this leaves in the tool
itself.

**A rule at `severity: warning` cannot fail the build** — `ast-grep scan` exits 0 on
warnings-only. `no-jsdoc-any-type`, `no-jsdoc-object-typedef` and `no-jq-raw-interpolation` are
all advisory. The real type ratchet is `check:type-coverage` (98%, and it genuinely bites);
`no-jsdoc-any-type` is a nudge, not the gate MEMORY.md once called it.

🚨 **`no-jq-raw-interpolation` guarded NOTHING until 2026-07-14.** It is `language: bash`, it
exists *because "the hooks build jq programs"* — and `hooks/` was not in the scan bound, while
`scripts/` contains zero `.sh` files. It passed `ast-grep test` 6/6 the entire time, on synthetic
snippets. **`ast-grep test` cannot see this**: it replays inline fixtures and never learns whether
a rule's language has anything to read. A rule can be perfect, tested, and pointed at nothing.

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
