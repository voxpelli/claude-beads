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

### Optional

**[vp-knowledge](https://github.com/voxpelli/vp-claude)** plugin — the retrospective skill chains into `/knowledge-gaps` for the knowledge gap audit step. Install via the same marketplace:

```bash
/plugin install vp-knowledge@vp-plugins
```

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
  vendor-sync/
    SKILL.md                            Vendor subtree sync workflow
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

 /vendor-sync [pkg]      -> vendor-sync skill     -> git subtree pull --squash
                                                  -> UPSTREAM auto-resolution
                                                  -> BM friction annotation
                                                  -> npm install + verify
```

## Relationship to vp-knowledge

`vp-beads` and `vp-knowledge` are complementary plugins. The `retrospective` skill chains into `/knowledge-gaps` (from vp-knowledge) for the knowledge gap audit step, and writes sprint learnings to the same Basic Memory graph that vp-knowledge maintains. Install both for the full workflow.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for version history. When a new version is
released, the `vp-beads` entry in
[vp-claude's marketplace.json](https://github.com/voxpelli/vp-claude/blob/main/.claude-plugin/marketplace.json)
must be bumped manually — the two repos are independent.

## Possible future additions

- **`vendor-sync` as a scheduled check** — periodic background check for vendor subtrees that are behind upstream, surfaced as a beads issue rather than an immediate pull.

## License

MIT
