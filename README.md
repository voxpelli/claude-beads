# vp-beads

A [Claude Code](https://claude.ai/code) plugin that automates the sprint workflow for projects that track work in a flat-YAML task store (`diarie`) — or in a `ROADMAP.md` / `VISION.md` split, or a manual list — backed by [Basic Memory](https://github.com/basicmachines-co/basic-memory). Sync vendor subtrees, track upstream friction, close sprints, run retrospectives — all without leaving your terminal. The flat-YAML tracker is the default substrate, not a requirement: skills degrade gracefully without it (see [Work-tracking substrates](#work-tracking-substrates)).

> **Direction:** vp-beads is the calm, sovereign answer to agentic development — one
> developer amplified by Claude Code agents, on plain text and git, no daemon. The stance
> behind the plain-text substrate lives in [`VISION.md`](./VISION.md).

## The tracker

Work lives in plain YAML files under `.diarie/tasks/tasks-<slug>.yml`, with
architectural decisions as markdown in `.diarie/decisions/<id>.md`. No daemon, no
database, no vendor lock-in — the files are canonical and every read is derived:

```bash
diarie ready           # what's ready to work on (dependency-aware ready walk)
diarie stats   # summary counts
diarie validate                 # integrity gate: schema, dep graph, duplicate ids
```

Writes are plain `Edit`/`Write` on the YAML — there is deliberately **no CRUD helper**.
The substrate stays a substrate; the opinions live in the skills.

Four task types: `task`, `doc`, `decision`, `milestone`. Framings like _bug_, _feature_,
_chore_, _story_ and _spike_ ride in `labels:`; an epic is a `task` with children pointing
at it via `parent:`.

The tracker is a real CLI — **`diarie`** (`diarie ready`, `diarie stats`,
`diarie validate`, `diarie init`, `diarie migrate`) — at
[diarie.dev](https://diarie.dev). It lives in its own repo
([voxpelli/diarie](https://github.com/voxpelli/diarie)) and is **published to npm**
(`diarie@0.2.2` current) — this repo consumes it as a `^0.2.0` dependency. Skills and hooks resolve it in
order: on `PATH`, else the project's `node_modules/.bin/diarie`.

## What it does

> **What an install actually gives you today: `/retrospective` and the session hooks.**
>
> The other skills below — `/ledger`, `/swarm-wave`, `/migrate-tracker`,
> `/deintegrate-beads` and `/vp-dream` — live in separate plugins under `plugins/`
> in this repository, and there is no marketplace entry for them yet. A plugin
> manifest can redirect `commands`, `agents`, `hooks` and `mcpServers`, but not
> `skills`, so the root plugin structurally cannot reach them. Documented here
> because they are part of this repository; not yet obtainable via
> `/plugin install`.

### `/retrospective` — Sprint retrospective generator

Reads git history, open upstream tracking files, and your current conversation to pre-populate a sprint retrospective:

```
/retrospective
```

Produces `RETRO-NN.md` covering what went well, what could improve, upstream observations, and lessons learned. Appends new tasks to `.diarie/tasks/` from findings, writes generalizable learnings to Basic Memory, and suggests documentation updates.

On every 4th sprint, also runs a full trend review: UPSTREAM file analysis, tracker hygiene (`diarie stats`, stale `in_progress` items, blocked tasks, `diarie validate`), and Basic Memory graph health (schema validation, drift detection, duplicate audit).

### `/ledger` — Upstream + sibling relationship tracking

The project's ledger of relationships with code it does not own: **upstream dependencies** and
**sibling projects**. One mode-routed skill that replaced four (`/upstream-tracker`,
`/synergy-tracker`, `/vendor-sync`, `/sibling-sync`), routed by an object × verb matrix — the object
is what you are tracking, the verb is what you are doing to it.

```
/ledger log                     # record friction, or a cross-project pattern
/ledger resolve                 # close a fixed upstream entry
/ledger review                  # status  ·  --trend  ·  --compare <sibling>
/ledger pull [package-name]     # git-subtree vendor sync
/ledger reconcile [sibling]     # bilateral sibling drift  ·  --auto-reciprocate
/ledger promote                 # → Basic Memory  ·  --sync-back pulls the other way
```

* **`log`** — infers the package or sibling and the problem from conversation context; checks Basic
  Memory for existing cross-project friction before logging. Handles upstream bugs, feature requests
  and contribution opportunities, plus sibling shared-patterns, divergences, extraction candidates
  and capability gaps. Entry formats support optional `[blocking|degraded|minor]` severity and
  `[upstream: url]` once you file an issue or PR.
* **`resolve`** — delete a fixed entry; `git rm` the file when empty (non-vendor only); annotate the
  corresponding Basic Memory entry.
* **`review`** — status across all tracking files. `--trend` runs the quarterly cross-cutting
  analysis with empirical resolution timelines (bugs 5–10 sprints, FRs 10–20, cross-vendor
  inconsistencies on next major). `--compare <sibling>` reads the other side.
* **`pull`** — reads `.claude/vendor-registry.json`, pulls each selected subtree with `--squash`,
  checks for conflicts before resolving them (always accept upstream), cleans stale vendor
  `node_modules`, re-links workspaces, verifies with `npm run check`. It then cross-references the
  full sync diff against open `UPSTREAM-*.md` entries — anything visibly addressed is deleted
  immediately, and the corresponding Basic Memory entry annotated. **This is the primary resolution
  mechanism; don't defer it to the retro.**
* **`reconcile`** — bilateral drift between this project and registered sibling vp-\* projects.
  **Read-only by default.** Surfaces reciprocation gaps, unreciprocated entries, stale-aligned rows,
  status divergence, and reciprocal friction — including Mode B, what the sibling tracks _about us_
  (`UPSTREAM-<sibling>.md` here ↔ `UPSTREAM-<this>.md` there). `--auto-reciprocate` writes reciprocal
  entries **only to the sibling side**, one confirmation per entry, never here and never to Basic
  Memory.
* **`promote` / `--sync-back`** — bidirectional Basic Memory sync. `promote` pushes generalizable
  friction and synergy into cross-project entity notes; `--sync-back` discovers friction other
  projects already recorded for dependencies this one uses. When no Basic Memory note exists,
  promotion flags it for enrichment via `/package-intel` or `/tool-intel` rather than creating a
  thin note.

### `/migrate-tracker [path-to-project]` — Guided bd → flat-YAML cutover

Migrate a project's issue tracker off beads (`bd`) onto the flat-YAML tracker:

```
/migrate-tracker
/migrate-tracker ../some-other-project
```

For projects still on beads. **beads 1.1.0's schema-migration gate panics on every write** — and because the binary is installed globally, every repo on beads broke at once. This is the cutover path vp-beads itself took. bd **reads** still work, and reads are all a migration needs, so no data is lost. Five workflows:

* **Detect and assess** — confirm bd is present and readable; census live vs closed issues; warn when `.beads/` is gitignored (meaning no bd history is in git today)
* **Export and archive** — freeze the full `bd export` snapshot to `.diarie/_archive/bd-final-export.jsonl`, the only git-tracked survivor
* **Migrate** — dry-run into a scratch root first; collapse bd's 9 issue types to 4 (framings ride in `labels:`); extract `## Acceptance Criteria`; drop edges to closed issues rather than dangle them, and report every one
* **Verify** — `diarie validate` plus a **dual-run** against `bd ready`. Exactly one divergence is expected (bd's ready-walk is type-blind and lists `decision`s as workable); anything else is a migration bug
* **Cut over** — retarget the project's own `CLAUDE.md`/`AGENTS.md` off bd; leave `.beads/` on disk as a frozen archive

Writes are plain `Edit`/`Write` on the YAML afterwards — there is no CRUD helper, by design.

### `/deintegrate-beads [path-to-project]` — Disarm bd after the migration

`/migrate-tracker` moves the work but deliberately leaves `.beads/` standing. This runs afterwards and takes bd's hands off the wheel:

```
/deintegrate-beads
```

**It never deletes `.beads/` or any data** — it disarms _machinery_, which is a different thing and is why it is safe to run. What bd leaves behind is easy to miss:

* **Five git hooks you cannot see.** `bd init` sets `git config core.hooksPath` → `.beads/hooks/`, so `.git/hooks/` looks pristine while `pre-commit`, `post-merge`, `pre-push`, `post-checkout` and `prepare-commit-msg` intercept every git operation. `pre-commit` shells out to `bd` and **propagates its exit code**. In this very repo, every commit was still routing through the dead binary weeks after the migration
* **A `dolt sql-server` daemon per repo**, which outlives the session and orphans itself
* **Injected instructions** — `bd setup claude` writes a managed block into `CLAUDE.md`/`AGENTS.md` and `SessionStart` hooks into `.claude/settings.json`

Five workflows: verify the migration is trusted (the gate is stricter than it looks — `diarie validate` now errors on a store that doesn't exist, but a store that exists and holds `tasks: []` is still perfectly `clean` at exit 0, so "clean" proves the store is well-formed, never that it holds anything. The probe therefore gates on a _counted_ task total, a parsed store, and committed files — not on `clean`); disarm the git hooks (both install shapes; it confirms `core.hooksPath` really resolves into `.beads/` before unsetting, so a husky setup is never collateral); stop the daemon (pid-checked, SIGTERM only — the daemon holds the Dolt store open and a `kill -9` could corrupt the very archive this skill refuses to delete); de-colonize the docs and Claude config; and report what is left — including machine-global leftovers, which it names but never touches.

Hooks are disarmed **before** the daemon is stopped, because the armed `pre-commit` shim calls `bd`, and any `bd` command re-spawns the daemon — stop it first and the next commit simply brings it back.

Everything is reversible, and the report gives you the exact re-arm command — bd stores an _absolute_ `core.hooksPath`, so the skill echoes the original value verbatim rather than guessing a relative one.

### `/swarm-wave [workflow] [wave-number|topic]` — Multi-agent wave orchestration

Orchestrate multi-agent development sprints using the swarm wave pattern:

```
/swarm-wave plan-sprint
/swarm-wave execute-wave 1
/swarm-wave post-wave-gate 1
```

Five workflows:

* **Plan a swarm sprint** — sources work from the tracker (`.diarie/tasks/`, via `diarie ready`), else a `ROADMAP.md` (read in its own idiom — see [Work-tracking substrates](#work-tracking-substrates)), else a manual list; builds a file-contention map, groups file-disjoint items into waves, and generates a `SWARM-NN.md` plan for approval. Tracker-less waves track run-state in the `SWARM-NN.md` Item Status table instead of task claim/close
* **Execute a wave** — claims tasks, launches 4-6 parallel task agents (each with explicit file scope) plus a background research agent
* **Post-wave gate** — hard blocking quality gate: two review agents (code + domain-specific) in parallel with `npm run check`, sequential tests, fix loop, commit + close. After the final wave, offers `/retrospective` handoff
* **Map file contention** — standalone utility to build a file-to-issue matrix and flag hot files
* **Research wave** — parallel research orchestration with dedup, code validation, and direct `.diarie/` task creation

`SWARM-NN.md` files are ephemeral (gitignored). All wave execution requires explicit user approval. File isolation is enforced via exhaustive per-agent file lists — no directory globs.

## Work-tracking substrates

vp-beads does not force a tracker on you. It works against whatever substrate a project already uses to track work:

* **Flat-YAML tracker** (`.diarie/`) — the default and richest substrate: typed tasks, dependencies, priorities, labels, and a ready/blocked walk. Used directly when a `.diarie/tasks/` directory exists. See [The tracker](#the-tracker).
* **`ROADMAP.md`** — a work plan **in whatever structure the project already uses**. `/swarm-wave` reads it in its own idiom (waves, status markers, file scopes) and never imposes a format; it declines cleanly when the file is not a parallelizable work plan. vp-beads never rewrites your ROADMAP.
* **`VISION.md`** — direction and voice, **not** a backlog. vp-beads never sources work items from it.
* **Manual list** — `/swarm-wave` can also plan from work items you supply inline, with no file at all.

How each skill behaves without the tracker is defined once by the `### Files-availability convention` in [`CLAUDE.md`](CLAUDE.md):

* **Tier A** — require-or-fallback (`/swarm-wave`): the tracker, else a `ROADMAP.md`, else a manual list; it only stops when no work source can be obtained.
* **Tier B** — tracker-specific: operates on `.diarie/` directly. An **empty** store is an empty backlog — a real answer. An **absent** store is an error (`ENOSTORE`), and means the project tracks its work somewhere else, so it redirects to `/swarm-wave` / `ROADMAP.md` rather than reporting that you have nothing to do. (Defined for reference; no active component currently occupies it — the former occupant `/backlog-groomer` was retired.)
* **Tier C** — degrade-and-announce (`/retrospective`): the rest of the workflow runs and every skipped tracker step is announced.

Silently skipping a tracker step is treated as a bug.

### The store is committed

`.diarie/` is a dotted directory but a **git-tracked** one — tasks, decisions, and their
history are committed and reviewed in PRs like any other project metadata (`.claude/`,
`.github/`). This is a deliberate reversal of the previous gitignored `.beads/`
arrangement: with the tracker as plain text in the repo, the backlog travels with the
clone, diffs in review, and has no export to go stale.

### What to gitignore (and what you must not)

These skills create files in your repo, and they fall into two groups that must not be
confused. Add this to your `.gitignore`:

```gitignore
# vp-beads — ephemeral scratch (the durable record lives in .diarie/)
AGENT-*.md
RETRO-*.md
SWARM-*.md
SPIKE-*.md

# vp-beads — machine-local overrides and private overlays. NOT optional:
# PRIVATE-SYNERGY-*.md is the ONLY thing keeping a proprietary sibling's name
# out of your public repo. Omit this line and the first private entry leaks.
.claude/*.local.*
PRIVATE-SYNERGY-*.md
```

**Do NOT gitignore `.diarie/`.** It sits next to `.beads/` — which _is_ ephemeral and
_is_ ignored — so the instinct to pattern-match is strong and wrong. `.diarie/` is the
task store itself; ignoring it throws away the backlog. `/migrate-tracker` refuses to
finish if it detects this (it asks `git check-ignore`, not the layout).

One thing to _decide_ rather than default: `.diarie/_archive/bd-final-export.jsonl`, which
`/migrate-tracker` writes with bd's **closed** issues. A pre-existing `*.jsonl` or
`_archive/` line will silently swallow it — `git add -A` says nothing, and the task store
commits looking perfectly clean. That may be exactly what you want: closed issues record
what was **done**, which your git history, CHANGELOG and retros usually already tell you,
while the backlog is for what comes **next**. The migrator warns and proceeds rather than
deciding for you. If you do want that history queryable, add `!.diarie/**` — note the
`/**`: a negation on the directory alone (`!.diarie/`) does **not** work, because git will
not descend into an excluded directory to re-include what is inside it.

## Installation

### Via slash commands

```bash
/plugin marketplace add voxpelli/vp-claude
/plugin install vp-beads@vp-plugins
```

### Manual settings.json

Add to `~/.claude/settings.json`:

```json
{
  "extraKnownMarketplaces": {
    "vp-plugins": {
      "source": { "source": "github", "repo": "voxpelli/vp-claude" }
    }
  },
  "enabledPlugins": {
    "vp-beads@vp-plugins": true
  }
}
```

## Prerequisites

### Required

**[Node.js](https://nodejs.org)** — runs the tracker readers (`diarie ready`, `diarie validate`). The task store is plain YAML in your repo, so there is no daemon and no database.

**The `diarie` CLI, in _your_ project.** The plugin does not supply it — the hooks resolve `diarie` from `PATH` or from your own `node_modules/.bin`, never from the plugin. Add it where your work lives:

```bash
npm install --save-dev diarie   # or: npm install -g diarie
```

**[Basic Memory](https://github.com/basicmachines-co/basic-memory)** MCP server — the knowledge graph backend for writing sprint learnings:

```bash
claude mcp add basic-memory -- basic-memory mcp
```

**[vp-knowledge](https://github.com/voxpelli/vp-claude)** plugin — provides BM infrastructure that vp-beads relies on: write-validation hooks (schema enforcement after `write_note`/`edit_note`), note quality standards, and the `/knowledge-gaps` skill used by the retrospective workflow. Install via the same marketplace:

```bash
/plugin install vp-knowledge@vp-plugins
```

vp-beads intentionally does not duplicate vp-knowledge's BM hooks — see [How it fits together](#how-it-fits-together) and [Relationship to vp-knowledge](#relationship-to-vp-knowledge).

## The tracker in this repository

vp-beads dogfoods its own substrate. This repo's work lives in
`.diarie/tasks/tasks-<slug>.yml` (with decisions in `.diarie/decisions/`), read by
`diarie ready` and gated by `diarie validate` — both wired into
`npm run check`. The directory is **committed**: the backlog is part of the repo, not a
machine-local artifact (see [The store is committed](#the-store-is-committed)).

The earlier beads (`bd`) store has been retired; its final export is kept under
`.diarie/_archive/` for provenance.

## Conventions

### Vendor registry

Declare vendor subtrees in `.claude/vendor-registry.json`:

```json
[
  {
    "prefix": "vendor/my-pkg",
    "remote": "my-pkg",
    "branch": "main",
    "package": "@scope/my-pkg"
  }
]
```

Each entry maps to a permanent `UPSTREAM-<package>.md` tracking file. The `package` field determines the filename (slashes → `--`, drop leading `@`).

### Upstream tracking files

* **Vendor packages** — permanent files, always exist (even when empty)
* **Non-vendor packages** — ephemeral files; delete entirely when all entries are resolved

File naming examples:

* `@voxpelli/typed-utils` → `UPSTREAM-voxpelli--typed-utils.md`
* `fastify` → `UPSTREAM-fastify.md`
* `brew:ripgrep` → `UPSTREAM-brew--ripgrep.md`
* `action:actions/checkout` → `UPSTREAM-action--actions--checkout.md`

### Private SYNERGY overlays

For cross-project notes that must stay out of a public repo (a proprietary sibling's internal paths, client names, unreleased plans), add a **gitignored** `PRIVATE-SYNERGY-<project>.md` companion alongside the committed `SYNERGY-<project>.md`. It holds extra private entries under the same four section headings. The `PRIVATE-` prefix is the safety mechanism: it keeps the overlay **outside the `SYNERGY-*.md` glob namespace**, so every public consumer (retrospective, promotion, reciprocation, the session-start hook) structurally cannot read it — **private entries are never promoted to Basic Memory or reciprocated to a sibling**, by construction rather than by per-consumer discipline. Only `ledger review`'s local-only sibling pass deliberately reads both files. Gitignored via the `PRIVATE-SYNERGY-*.md` rule; the session-start hook warns if any is accidentally tracked.

## Plugin structure

```
.claude-plugin/plugin.json              Root plugin manifest
skills/
  retrospective/
    SKILL.md                            Sprint retrospective workflow
plugins/                                workspace plugins (own package.json + check)
  ledger/
    skills/ledger/
      SKILL.md                          Mode-routed upstream + sibling ledger
      references/                       log, review, resolve, promote, pull,
                                        reconcile, synergy-entry-format,
                                        synergy-bm-format,
                                        basic-memory-friction-format,
                                        project-name-derivation
  swarm-wave/
    skills/swarm-wave/
      SKILL.md                          Multi-agent wave orchestration
      references/                       wave-planning, contention, review-gate,
                                        concurrency, command-patterns,
                                        roadmap-interpretation
  diarie-adopt/
    skills/
      migrate-tracker/SKILL.md          Guided bd → flat-YAML tracker cutover
      deintegrate-beads/SKILL.md        Disarm bd's machinery after migration
    scripts/
      beads-probe.mjs                   Read-only beads reconnaissance probe
      check-beads-probe.mjs             Unit tests for the probe
  vp-dream/
    skills/vp-dream/
      SKILL.md                          Claude file-memory consolidation
      references/                       native-autodream-contract,
                                        synthesis-rationale
      scripts/audit-memory.sh           Descriptive memory-dir audit (pure bash)
scripts/                                dev-only gates; see Validation
eslint-local-rules/
hooks/
  hooks.json                            Hook definitions (2 event types)
  session-start.sh                      Tracker prime (startup) + compaction recovery (source=compact) + sensitive-file warning, dormancy nudges, trend-review
  post-file-edit.sh                     Auto-format hooks/*.sh with shfmt
  post-tasks-validate.sh                Validate .diarie/tasks/ on edit; silent when clean
```

## How it fits together

```
 User says / event        Triggers                 Output
 ──────────────────────   ──────────────────────   ──────────────────────────────
 /retrospective          -> retrospective skill   -> RETRO-NN.md
                                                  -> tasks appended to .diarie/tasks/
                                                  -> Basic Memory learnings
                                                  -> doc update suggestions

 upstream friction       -> ledger log           -> UPSTREAM-<pkg>.md entry
 "synergy" / "compare"      ledger resolve        -> SYNERGY-<project>.md entry
 "sibling drift"            ledger review         -> status / --trend / --compare
 /ledger                    ledger promote        -> Basic Memory, both directions
                            ledger reconcile      -> sibling drift (read-only)
                                                  -> --auto-reciprocate writes
                                                     ONLY to the sibling side

 "swarm sprint" / "wave" -> swarm-wave skill      -> SWARM-NN.md wave plan
 /swarm-wave                                      -> sources: .diarie / ROADMAP / manual
                                                  -> parallel agent execution
                                                  -> post-wave quality gate
                                                  -> chains to /retrospective

 /ledger pull [pkg]      -> ledger pull           -> git subtree pull --squash
                                                  -> UPSTREAM auto-resolution
                                                  -> BM friction annotation
                                                  -> npm install + verify
```

## Relationship to vp-knowledge

`vp-beads` and `vp-knowledge` are complementary plugins that form a layered pair:

* **vp-knowledge** owns BM infrastructure — write-validation hooks (`post-bm-write-validate.sh` triggers `schema_validate` after every `write_note`/`edit_note`), note quality standards (`vp-note-quality` skill), and graph health tooling.
* **vp-beads** builds sprint workflows on top — `/retrospective` and `/ledger` both write to Basic Memory, relying on vp-knowledge's hooks to validate those writes.

Concrete integration points:

| vp-beads feature                                                                                       | vp-knowledge dependency                             |
| ------------------------------------------------------------------------------------------------------ | --------------------------------------------------- |
| Retrospective step 6                                                                                   | Chains into `/knowledge-gaps`                       |
| All BM writes (`ledger promote`, `ledger pull`'s annotations, `/retrospective` step 7) | `post-bm-write-validate.sh` hook validates schema   |
| Sprint learnings                                                                                       | Written to the same BM graph vp-knowledge maintains |

**Do not duplicate vp-knowledge hooks in vp-beads.** Both plugins are installed together; duplicating hooks causes double-fire (benign but wasteful) and creates a maintenance burden.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history. When a new version is
released, the `vp-beads` entry in
[vp-claude's marketplace.json](https://github.com/voxpelli/vp-claude/blob/main/.claude-plugin/marketplace.json)
must be bumped manually — the two repos are independent.

## Possible future additions

* **`ledger pull` as a scheduled check** — periodic background check for vendor subtrees that are behind upstream, surfaced as a task in `.diarie/tasks/` rather than an immediate pull.

## Prior art & acknowledgments

vp-beads stands on borrowed shoulders, and it keeps parts of several. Credit to the people,
not just the projects — and an honest note on what is kept vs. declined:

* **[beads](https://github.com/steveyegge/beads)** — Steve Yegge & the
  [gastownhall](https://github.com/gastownhall) maintainers. The substrate vp-beads was
  built on, and has now migrated off (for the operational complexity of its Dolt-backed
  daemon, not its data model — that part is good; `ready` and the dependency walk are
  reimplemented over flat files). ~~**Kept:** the 9-type issue vocabulary.~~ _Corrected
  2026-06-10, decision [`vp-beads-etm`](DESIGN-tracker-exploration.md): the tracker adopts
  a 4-type model (`task`/`doc`/`decision`/`milestone`); bd's other five types ride in
  `labels:`. The taxonomy-documentation credit stands._ **Left:** the Dolt substrate. The
  plugin keeps the name.
* **[hone-ai](https://github.com/oskarhane/hone-ai)** — Oskar Hane. The amnesiac-loop file
  shape. **Kept:** the `progress.txt` + `AGENTS.md` accretion _discipline_ and the idea of
  a separate reviewer. **Declined:** its three-stage execution loop (vp-beads' skills own
  the workflow).
* **The Ralph loop** — [Geoffrey Huntley](https://ghuntley.com/ralph/); and
  **[`snarktank/ralph`](https://github.com/snarktank/ralph)** — Ryan Carson, for the
  `prd`→`progress.txt` lineage.
* **"Long-running Agents"** —
  [Addy Osmani](https://addyosmani.com/blog/long-running-agents/), for the "state lives
  outside the amnesiac agent" framing.
* **Anthropic** —
  ["Effective harnesses for long-running agents"](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
  (the feature-list + progress-notes + test-ratchet shape).
* **[Backlog.md](https://github.com/MrLesk/Backlog.md)** — MrLesk. Evaluated as a substrate
  candidate and, in the end, declined — but the evaluation sharpened the design.
* **[Basic Memory](https://github.com/basicmachines-co/basic-memory)** — the cross-project
  knowledge graph vp-beads writes its learnings to.

The calm-sovereign stance behind the substrate rests on a wider canon — local-first
(Ink & Switch), calm tech (Weiser), convivial tools (Illich), Worse-is-Better (Gabriel) —
credited in [`VISION.md`](./VISION.md).

## License

MIT
