# vp-beads

A [Claude Code](https://claude.ai/code) plugin that automates the sprint workflow for projects using [beads](https://github.com/steveyegge/beads) and [Basic Memory](https://github.com/basicmachines-co/basic-memory). Sync vendor subtrees, track upstream friction, close sprints, run retrospectives — all without leaving your terminal.

## What it does

### Sprint Review agent — Proactive end-of-sprint gate

Triggers automatically when a sprint closes and gives a concise summary with a single next-step recommendation:

> "bd close worked. What should we do now?"

> "Okay, I think that's everything for this sprint."

> "Should we do a retro? I've lost track of which sprint we're on."

Reads git history, open beads issues, `UPSTREAM-*.md` files, and (when available) Basic Memory friction notes for cross-project awareness, then recommends one of five actions:

| Recommendation | Condition |
|---|---|
| **Not ready** | Fewer than 3 meaningful commits |
| **Ready to close** — run `/retrospective` | Clean state, no gaps |
| **Groom the backlog first** — run `/backlog-groomer` | Bloated or stale backlog (>30 open, carry-overs, stale issues) |
| **Upstream work first** — run `/upstream-tracker` | Untracked friction detected |
| **Trend-review sprint** | Every 4th sprint — full audit ahead |

Read-only. Never writes files.

### `/retrospective` — Sprint retrospective generator

Reads git history, open upstream tracking files, and your current conversation to pre-populate a sprint retrospective:

```
/retrospective
```

Produces `RETRO-NN.md` covering what went well, what could improve, upstream observations, and lessons learned. Creates beads issues from findings, writes generalizable learnings to Basic Memory, and suggests documentation updates.

On every 4th sprint, also runs a full trend review: UPSTREAM file analysis, beads issue hygiene (`bd stats`, stale `in_progress` items, blocked issues), and Basic Memory graph health (schema validation, drift detection, duplicate audit).

### `/backlog-groomer` — Backlog triage and research

Triage, prioritize, and research work tracked in beads:

```
/backlog-groomer
/backlog-groomer rate limiting
```

Six workflows in two groups:

**Grooming** — review and triage open issues, reprioritize based on sprint goals, suggest closures for stale/obsolete items. Cross-references Basic Memory for known friction and UPSTREAM files for vendor context.

**Research** — investigate a topic using multi-source research (Basic Memory → DeepWiki → Tavily), create structured issues from findings with title conventions and dependency linking, or enrich an existing issue with research context.

All mutations require explicit user approval. Complements sprint-review (which fires at sprint end) by operating at sprint start.

### `/upstream-tracker` — Upstream issue tracking

Manage `UPSTREAM-*.md` files that track bugs, feature requests, and API friction in upstream packages:

```
/upstream-tracker
```

Supports seven workflows:

- **Log** — infers the package and problem from conversation context; checks Basic Memory for existing cross-project friction before logging
- **Review** — summarize all open items across tracking files
- **Resolve** — delete a fixed entry; `git rm` the file when empty (non-vendor only); annotates the corresponding Basic Memory friction entry
- **Trend review** — quarterly cross-cutting analysis, with empirical resolution timelines:
  bugs resolve in 5–10 sprints, FRs in 10–20, cross-vendor inconsistencies on next major version
- **Sprint retro support** — draft the "Upstream observations" section
- **Promote to Basic Memory** — promotes generalizable friction from project-local UPSTREAM files into cross-project Basic Memory entity notes (`## Upstream Friction` sections). Supports all target types: npm, brew, cask, GitHub Actions, Docker, VSCode extensions. When no BM note exists, flags for enrichment via `/package-intel` or `/tool-intel`
- **Sync from Basic Memory** — discovers friction already known in Basic Memory for this project's dependencies but not yet tracked locally. Pull-based, user-invoked

Entry formats support optional `[blocking|degraded|minor]` severity and `[upstream: url]` when you file an upstream issue or PR.

### `/vendor-sync [package-name]` — Vendor subtree sync

Pull latest upstream changes from one or all git subtrees:

```
/vendor-sync
/vendor-sync auth
```

Reads `.claude/vendor-registry.json`, pulls each selected subtree with `--squash`, checks for conflicts before resolving them (always accept upstream), cleans stale vendor `node_modules`, re-links workspaces, and verifies with `npm run check` + `npm test`.

Step 7 cross-references the full sync diff against open `UPSTREAM-*.md` entries — any issue visibly addressed in the diff is deleted immediately. This is the primary resolution mechanism; don't defer to the retro. Step 8b annotates the corresponding Basic Memory friction entries when available.

### `/sibling-sync [--auto-reciprocate] [sibling-name]` — Bilateral sibling reconciliation

Compare `SYNERGY-*.md` and `UPSTREAM-*.md` files between this project and registered sibling vp-* projects:

```
/sibling-sync
/sibling-sync vp-knowledge
/sibling-sync --auto-reciprocate
```

Read-only by default. Surfaces drift, reciprocal gaps, stale-aligned rows, status divergence, and reciprocal-friction across siblings. Four workflows:

- **Discover sibling(s)** — registry resolution + path probing via `.claude/synergy-registry.json` (+ optional `.local.json` override)
- **Sync sibling SYNERGY** — reciprocal gaps, unreciprocated entries, stale alignment claims, status drift
- **Sync sibling UPSTREAM** — Mode A: shared third-party dependency friction (duplicates, complementary workarounds, sibling-only entries); Mode B: reciprocal sibling-friction pairs (`UPSTREAM-<sibling>.md` ↔ `UPSTREAM-<this>.md`) surfacing what the sibling tracks about us
- **Apply reciprocation batch** (opt-in `--auto-reciprocate`) — per-entry confirmation, writes only to the sibling side

Workflows 2 and 3 end with a per-sibling two-tier action menu (single `AskUserQuestion`, `header: "Synergy"` + `header: "Upstream"`) that delegates writes to `/vp-beads:synergy-tracker`, `/vp-beads:upstream-tracker`, or `bd create` via the `Skill` tool — replacing the previous copy-paste hint workflow. Picking "None" yields a report-only run.

### `/swarm-wave [workflow] [wave-number|topic]` — Multi-agent wave orchestration

Orchestrate multi-agent development sprints using the swarm wave pattern:

```
/swarm-wave plan-sprint
/swarm-wave execute-wave 1
/swarm-wave post-wave-gate 1
```

Five workflows:

- **Plan a swarm sprint** — reads `bd ready`, builds a file-contention map, groups file-disjoint issues into waves, and generates a `SWARM-NN.md` plan for approval
- **Execute a wave** — claims issues, launches 4-6 parallel task agents (each with explicit file scope) plus a background research agent
- **Post-wave gate** — hard blocking quality gate: two review agents (code + domain-specific) in parallel with `npm run check`, sequential tests, fix loop, commit + close. After the final wave, offers `/retrospective` handoff
- **Map file contention** — standalone utility to build a file-to-issue matrix and flag hot files
- **Research wave** — parallel research orchestration with dedup, code validation, and handoff to `/backlog-groomer` for issue creation

`SWARM-NN.md` files are ephemeral (gitignored). All wave execution requires explicit user approval. File isolation is enforced via exhaustive per-agent file lists — no directory globs.

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

**[beads](https://github.com/steveyegge/beads)** (`bd` CLI) — git-backed issue tracker. The retrospective skill creates beads issues from findings and runs `bd stats` for health checks.

**[Basic Memory](https://github.com/basicmachines-co/basic-memory)** MCP server — the knowledge graph backend for writing sprint learnings:

```bash
claude mcp add basic-memory -- basic-memory mcp
```

**[vp-knowledge](https://github.com/voxpelli/vp-claude)** plugin — provides BM infrastructure that vp-beads relies on: write-validation hooks (schema enforcement after `write_note`/`edit_note`), note quality standards, and the `/knowledge-gaps` skill used by the retrospective workflow. Install via the same marketplace:

```bash
/plugin install vp-knowledge@vp-plugins
```

vp-beads intentionally does not duplicate vp-knowledge's BM hooks — see [How it fits together](#how-it-fits-together) and [Relationship to vp-knowledge](#relationship-to-vp-knowledge).

## beads and Dolt configuration in this repository

This project uses **[beads](https://github.com/gastownhall/beads)** (`bd` CLI) with a **Dolt** backend for issue tracking. The local configuration is:

- **Dolt mode:** `server` (running on localhost, PID managed by `bd`)
- **Database name:** `vp_beads`
- **Sync target:** The project's GitHub remote (`git@github.com:voxpelli/claude-beads.git`), not DoltHub
- **`sync.remote` in `.beads/config.yaml:** `git+ssh://git@github.com/voxpelli/claude-beads.git`

### What is committed to git vs. gitignored

`.beads/` is **partially tracked**. The root `.gitignore` only excludes specific patterns; the canonical exclusions live in `.beads/.gitignore`:

| Path | Status | Note |
|---|---|---|
| `.beads/config.yaml` | ✅ Committed | Validation rules, `sync.remote` |
| `.beads/metadata.json` | ✅ Committed | Backend metadata (`dolt_mode: server`, `dolt_database: vp_beads`) |
| `.beads/issues.jsonl` | ✅ Committed | Auto-exported JSONL (~182 KB) |
| `.beads/interactions.jsonl` | ✅ Committed | Agent audit trail (~40 KB) |
| `.beads/hooks/` | ✅ Committed | Git hooks (pre-commit, post-merge, etc.) |
| `.beads/dolt/` | ❌ Gitignored | Full Dolt database (binary) |
| `.beads/backup/` | ❌ Gitignored | JSONL backup exports |
| `.beads/dolt-server.*` | ❌ Gitignored | Runtime PID, lock, log, port |
| `.beads/.beads-credential-key` | ❌ Gitignored | Per-machine auth secret |

### Dolt remote state

`bd dolt remote list` reports an `origin` remote, but the underlying Dolt storage (`.beads/dolt/.dolt/repo_state.json`) shows `"remotes": {}`. The remote is synthesized from `.beads/config.yaml`'s `sync.remote` value.

The GitHub remote **does** contain a Dolt ref (`refs/dolt/data` → commit `b44b439e6370f195100eb8089532c8ac92c69726`), confirming `bd dolt push` succeeded historically. However, this ref is **not present locally** — Dolt refs under `refs/dolt/` are not fetched by standard `git fetch`, so the local clone never pulled it back. Also present on the remote: `refs/heads/__dolt_remote_info__` (`0abb03ec`).

Beads can work entirely offline; the remote is only needed for cross-machine synchronization.

### No DoltHub

There is **no DoltHub remote** configured. DoltHub is supported by beads (and by Dolt itself) but this repository uses the standard GitHub git remote as its Dolt sync target.

### Cross-source verification

This configuration was verified by inspecting the local filesystem and `bd` CLI output, then cross-referencing external sources:

| Source | Finding |
|---|---|
| **Local `bd` CLI** (`bd config list`, `bd dolt remote list`, `bd dolt status`) | Server mode, `vp_beads` database, `sync.remote` points to GitHub |
| **`gh` CLI** (`gh api repos/.../git/refs`) | Dolt refs (`refs/dolt/data`) exist on the GitHub remote; `.beads/` files (config, JSONL, hooks) are committed |
| **DeepWiki** (`gastownhall/beads`) | Beads does not require DoltHub; embedded mode stores data in `.beads/embeddeddolt/`, server mode in `.beads/dolt/`; Dolt directories are git-ignored |
| **Context7** (`/gastownhall/beads`) | Standard layout: `.beads/dolt/` (gitignored), `config.yaml` + `metadata.json` (tracked) |
| **Tavily / DoltHub blog** (2026-05-29) | "Issues are stored in local Dolt. `.beads/issues.jsonl` is an export, not cross-machine sync or the source of truth." |
| **Basic Memory** (`brew/brew-beads`) | Confirms Dolt as storage backend, cell-level merge, `.beads/dolt/` as binary storage |
| **Raindrop** (`steveyegge/beads` bookmark) | Cached body confirms Dolt transition from SQLite, "JSONL maintained for git portability" |
| **Readwise** | No saved material on beads or Dolt+beads |

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

- **Vendor packages** — permanent files, always exist (even when empty)
- **Non-vendor packages** — ephemeral files; delete entirely when all entries are resolved

File naming examples:

- `@voxpelli/typed-utils` → `UPSTREAM-voxpelli--typed-utils.md`
- `fastify` → `UPSTREAM-fastify.md`
- `brew:ripgrep` → `UPSTREAM-brew--ripgrep.md`
- `action:actions/checkout` → `UPSTREAM-action--actions--checkout.md`

## Plugin structure

```
.claude-plugin/plugin.json              Plugin manifest
agents/
  sprint-review.md                      End-of-sprint assessment agent
skills/
  backlog-groomer/
    SKILL.md                            Backlog triage and research workflow
    references/
      backlog-health-heuristics.md      Staleness, closure, priority heuristics
  retrospective/
    SKILL.md                            Sprint retrospective workflow
  upstream-tracker/
    SKILL.md                            Upstream issue tracking workflow
    references/
      basic-memory-friction-format.md   BM section templates, routing, gotchas
  vendor-sync/
    SKILL.md                            Vendor subtree sync workflow
  synergy-tracker/
    SKILL.md                            Cross-project synergy tracking workflow
    references/
      synergy-entry-format.md           Entry templates, naming, registry schema
      synergy-bm-format.md              BM section templates for workflow 5
      project-name-derivation.md        Four-tier project-name derivation algorithm
  sibling-sync/
    SKILL.md                            Bilateral SYNERGY/UPSTREAM reconciliation
  swarm-wave/
    SKILL.md                            Multi-agent wave orchestration
    references/
      wave-planning-checklist.md        Pre/post-wave gates, anti-patterns
      file-contention-and-clustering.md Contention thresholds, wave sizing
      review-gate-protocol.md           Two-reviewer gate, confidence thresholds
      agent-concurrency-limits.md       Memory pressure, backpressure protocol
      command-patterns.md               Research agent selection, agent prompts
hooks/
  hooks.json                            Hook definitions (4 event types)
  precompact.sh                         Sprint insight capture before compaction
  session-start.sh                      Sensitive-file warning, dormancy nudges, trend-review
  post-file-edit.sh                     Auto-format hooks/*.sh and scripts/*.sh with shfmt
  post-bm-failure-classify.sh           BM error classification + recovery guidance
```

## How it fits together

```
 User says / event        Triggers                 Output
 ──────────────────────   ──────────────────────   ──────────────────────────────
 "groom" / "triage"      -> backlog-groomer skill -> triage table + proposals
 "research X"            -> backlog-groomer skill -> research brief + issue creation

 "sprint done" / bd close -> sprint-review agent -> summary + recommendation
                                                     ├── "run /retrospective"
                                                     ├── "run /upstream-tracker first"
                                                     ├── "run /backlog-groomer"
                                                     ├── "trend-review sprint"
                                                     └── "not ready yet"

 /retrospective          -> retrospective skill   -> RETRO-NN.md
                                                  -> beads issues from findings
                                                  -> Basic Memory learnings
                                                  -> doc update suggestions

 upstream friction       -> upstream-tracker skill-> UPSTREAM-<pkg>.md entry
 /upstream-tracker                                -> resolve / trend-review
                                                  -> promote to Basic Memory
                                                  -> sync from Basic Memory

 "synergy" / "compare"   -> synergy-tracker skill -> SYNERGY-<project>.md entry
 /synergy-tracker                                 -> review open synergies
                                                  -> compare with sibling project
                                                  -> promote to Basic Memory

 "sibling drift" / "sync" -> sibling-sync skill   -> drift findings (read-only)
 /sibling-sync                                    -> two-tier action menu
                                                  -> delegates via Skill tool
                                                  -> --auto-reciprocate writes

 "swarm sprint" / "wave" -> swarm-wave skill      -> SWARM-NN.md wave plan
 /swarm-wave                                      -> parallel agent execution
                                                  -> post-wave quality gate
                                                  -> chains to /retrospective

 /vendor-sync [pkg]      -> vendor-sync skill     -> git subtree pull --squash
                                                  -> UPSTREAM auto-resolution
                                                  -> BM friction annotation
                                                  -> npm install + verify
```

## Relationship to vp-knowledge

`vp-beads` and `vp-knowledge` are complementary plugins that form a layered pair:

- **vp-knowledge** owns BM infrastructure — write-validation hooks (`post-bm-write-validate.sh` triggers `schema_validate` after every `write_note`/`edit_note`), note quality standards (`vp-note-quality` skill), and graph health tooling.
- **vp-beads** builds sprint workflows on top — retrospective, upstream-tracker, synergy-tracker, and vendor-sync all write to Basic Memory, relying on vp-knowledge's hooks to validate those writes.

Concrete integration points:

| vp-beads feature | vp-knowledge dependency |
|---|---|
| Retrospective step 6 | Chains into `/knowledge-gaps` |
| All BM writes (upstream-tracker W6, vendor-sync 8b, retrospective 7) | `post-bm-write-validate.sh` hook validates schema |
| Sprint learnings | Written to the same BM graph vp-knowledge maintains |

**Do not duplicate vp-knowledge hooks in vp-beads.** Both plugins are installed together; duplicating hooks causes double-fire (benign but wasteful) and creates a maintenance burden.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history. When a new version is
released, the `vp-beads` entry in
[vp-claude's marketplace.json](https://github.com/voxpelli/vp-claude/blob/main/.claude-plugin/marketplace.json)
must be bumped manually — the two repos are independent.

## Possible future additions

- **`vendor-sync` as a scheduled check** — periodic background check for vendor subtrees that are behind upstream, surfaced as a beads issue rather than an immediate pull.

## License

MIT
