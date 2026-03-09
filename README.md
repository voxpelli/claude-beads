# vp-beads

A [Claude Code](https://claude.ai/code) plugin that brings sprint workflow
automation to projects using [beads](https://github.com/steveyegge/beads) and
[Basic Memory](https://github.com/basicmachines-co/basic-memory). Run
retrospectives, track upstream friction — all without leaving your terminal.

## What it does

### `/retrospective` — Sprint retrospective generator

Reads git history, open upstream tracking files, and your current conversation
to pre-populate a sprint retrospective:

```
/retrospective
```

Produces a `RETRO-NN.md` file covering what went well, what could improve,
upstream observations, and lessons learned. On every 4th sprint, also runs a
full trend review of UPSTREAM files, beads issue hygiene, and Basic Memory graph
health.

### `/upstream-tracker` — Upstream issue tracking

Manage `UPSTREAM-*.md` files that track bugs, feature requests, and API friction
in upstream packages:

```
/upstream-tracker
```

Supports five workflows:

- **Log** — add a new bug, feature request, or cross-vendor inconsistency
- **Review** — summarize all open items across tracking files
- **Resolve** — delete a fixed entry (or the whole file for non-vendor packages)
- **Trend review** — quarterly cross-cutting analysis
- **Sprint retrospective support** — draft the "Upstream observations" section

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

**[beads](https://github.com/steveyegge/beads)** (`bd` CLI) — git-backed issue
tracker. The retrospective skill creates beads issues from findings and runs
`bd stats` for health checks.

**[Basic Memory](https://github.com/basicmachines-co/basic-memory)** MCP server
— the knowledge graph backend for writing sprint learnings:

```bash
claude mcp add basic-memory -- basic-memory mcp
```

### Optional

**[vp-knowledge](https://github.com/voxpelli/vp-claude)** plugin — the
retrospective skill chains into `/knowledge-gaps` for the knowledge audit step.
Install via the same marketplace:

```bash
/plugin install vp-knowledge@vp-plugins
```

## Upstream tracking conventions

### Vendor vs non-vendor packages

- **Vendor packages** get permanent `UPSTREAM-<name>.md` files (always present,
  even when empty). Declare them in `.claude/vendor-registry.json` as
  `[{prefix, remote, branch}]` or in `workspaces` in `package.json`.
- **Non-vendor packages** get ephemeral files. Delete the file entirely once all
  entries are resolved — git history preserves what was tracked.

### File naming

`UPSTREAM-<package-name>.md` with slashes replaced by `--`. Examples:

- `@voxpelli/typed-utils` → `UPSTREAM-voxpelli--typed-utils.md`
- `fastify` → `UPSTREAM-fastify.md`

## Plugin structure

```
.claude-plugin/plugin.json              Plugin manifest
skills/
  retrospective/
    SKILL.md                            Sprint retrospective workflow
  upstream-tracker/
    SKILL.md                            Upstream issue tracking workflow
```

## License

MIT
