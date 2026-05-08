# Synergy Entry Format Reference

Reference material for synergy-tracker workflows. See `SKILL.md` for the
workflow steps that reference this document.

## SYNERGY-\*.md file template

```markdown
# SYNERGY-<project-name>

Tracking cross-project synergy with [<project-name>](<remote-url>).

## Shared Patterns

_No entries yet._

## Divergences

_No entries yet._

## Extraction Candidates

_No entries yet._

## They Have / We Don't

_No entries yet._
```

If `remote` is not available from the registry, use the project name as plain
text without a link: `Tracking cross-project synergy with <project-name>.`

## Entry formats

All entries follow the same structural pattern: a bullet line with bold title and
parenthesized date, followed by indented structured fields on continuation lines.
Omit fields that add no signal.

### Shared Patterns

Captures practices or implementations that exist in both projects and should stay
aligned. `Status:` grades current alignment. `Last verified:` records the date
alignment was last confirmed.

```
- **Short title** (YYYY-MM-DD) — Description of the shared approach and why
  alignment matters.
  Status: aligned|drifting · Last verified: YYYY-MM-DD
```

| Field | Value | Meaning |
|---|---|---|
| `Status:` | `aligned` | Implementations are functionally identical or near-identical |
| `Status:` | `drifting` | Same concept, but implementations have diverged |

When `Status: drifting`, add a `Note:` continuation line explaining the drift
vector and urgency.

### Divergences

Documents cases where both projects solve the same problem differently. The goal
is not to force convergence — `accept-difference` is a valid outcome.

```
- **Short title** (YYYY-MM-DD) — What this project does, what the sibling does,
  and the consumer-side impact of the difference.
  Convergence path: accept-difference|adopt-theirs|propose-shared · Reason: description
```

| `Convergence path:` | Meaning |
|---|---|
| `accept-difference` | Intentional; no action needed |
| `adopt-theirs` | This project plans to adopt the sibling's approach |
| `propose-shared` | The two approaches should be unified in a shared abstraction |

When `adopt-theirs` or `propose-shared`, add an optional `Action:` continuation
line naming the concrete next step.

### Extraction Candidates

Tracks patterns or implementations worth extracting into a standalone package or
shared utility. The highest-leverage section.

```
- **Short title** (YYYY-MM-DD) — What was built, why it could be useful to the
  sibling or as a shared package, and the consumer-side motivation.
  Source: <file-or-module> · Readiness: ready|needs-cleanup|proof-of-concept
  Effort: trivial|moderate|significant
```

| `Readiness:` | Meaning |
|---|---|
| `ready` | Extractable as-is with minimal rework |
| `needs-cleanup` | Concept valid but too project-specific to share directly |
| `proof-of-concept` | Demonstrates the approach but not library-quality |

| `Effort:` | Meaning |
|---|---|
| `trivial` | A few hours; fits within a sprint |
| `moderate` | 1-3 days; may need its own beads issue |
| `significant` | Multi-sprint effort; needs architectural planning |

### They Have / We Don't

Documents capabilities the sibling project has that this project lacks.

**Domain-fit test** (apply before logging):

> Pass test: "this project has the underlying need but lacks the implementation."
> Fail test: "the sibling has a capability in a different domain than this project's."

Sprint 19 worked failures: vp-beads's `swarm-wave` (sprint orchestration ≠
research fan-outs domain) and vp-beads's `vendor-sync` (vp-beads vendors
content; vp-claude has no vendored surface to sync). Both passed the surface
filter but failed the domain-fit test, and would have produced noise the
user had to dismiss.

```
- **Short title** (YYYY-MM-DD) — What the sibling has, why this project would
  benefit from it, and the estimated adoption cost.
  Priority: adopt-soon|consider|deferred · Effort: trivial|moderate|significant
```

| `Priority:` | Meaning |
|---|---|
| `adopt-soon` | High value, low friction — pursue this sprint |
| `consider` | Worth exploring but not urgent |
| `deferred` | Acknowledged, not planned |

## Naming convention

SYNERGY files are named after the sibling project. They live in the project root
alongside UPSTREAM files.

**Rules:**

1. Start with the project's canonical short name (its repository name). The
   `name` field in `synergy-registry.json` is authoritative — the SYNERGY
   filename always derives from it. Choose registry names that match repository
   slugs to avoid confusion.
2. Replace all `/` with `--`
3. Drop leading `@`

**Examples:**

| Project reference | SYNERGY filename |
|---|---|
| `vp-knowledge` | `SYNERGY-vp-knowledge.md` |
| `voxpelli/vp-claude` | `SYNERGY-vp-claude.md` |
| `@scope/shared-utils` | `SYNERGY-scope--shared-utils.md` |
| `some-org/monorepo` subpackage `packages/utils` | `SYNERGY-monorepo--packages--utils.md` |

When the repo name alone is ambiguous (e.g., `utils`, `core`), include the owner:
`SYNERGY-voxpelli--utils.md`.

## Synergy registry format

The synergy registry lives at `.claude/synergy-registry.json`. It declares which
projects have active synergy tracking relationships.

```json
[
  {
    "name": "vp-knowledge",
    "file": "SYNERGY-vp-knowledge.md",
    "remote": "https://github.com/voxpelli/vp-claude",
    "bm-entity": "engineering/agents/vp-plugins-vp-beads-and-vp-knowledge",
    "relationship": "sibling-plugin"
  }
]
```

| Field | Required | Description |
|---|---|---|
| `name` | yes | Short display name for the related project |
| `file` | yes | Exact filename of the SYNERGY tracking file |
| `remote` | no | Canonical URL for the related project |
| `bm-entity` | no | Basic Memory entity path — consumed by `/synergy-tracker` workflow 5 (Promote to Basic Memory) |
| `relationship` | no | One of: `sibling-plugin`, `shared-tooling`, `fork`, `consumer`, `coordinated-release`, `dependency`. See `validate-plugin.mjs` `KNOWN_RELATIONSHIPS` for the canonical set; values outside it emit a validator warning. |
| `local-path` | no | On-disk path to the sibling checkout (relative paths resolve from this project root). When absent, skills fall back to `../<name>/`. Prefer leaving this out of the committed registry and recording machine-specific paths in `.claude/synergy-registry.local.json` (see below). |

> **`bm-entity` naming rule:** Use
> `engineering/agents/vp-plugins-<this-project>-and-<sibling>` — a
> relationship note path, not an entity path. The `npm/<name>` form
> (seen in some older examples) is incorrect for synergy relationships;
> those `npm/` paths are for package-friction notes owned by
> `/upstream-tracker` workflow 6 (Promote to Basic Memory). A SYNERGY
> file tracks how *two projects relate to each other*, not facts about
> the sibling as a software package — so the relationship note belongs
> in `engineering/agents/`.

### Relationship vocabulary

The six recognized values describe sibling shape, not engineering relationships in Basic Memory:

- `sibling-plugin` — peer Claude Code plugin under the same maintainer (default for vp-* plugins).
- `shared-tooling` — peer that shares build/lint/test tooling but ships independently.
- `fork` — divergent fork tracked for cherry-picks.
- `consumer` — downstream project that depends on this one.
- `coordinated-release` — peer that releases in lockstep (shared version cadence).
- `dependency` — upstream this project consumes directly (rare for sibling-tracking; usually belongs in `vendor-registry.json`).

If `.claude/synergy-registry.json` does not exist, discover SYNERGY files by
globbing `SYNERGY-*.md`. The registry is optional but recommended for projects
with multiple synergy relationships.

### Local override file

`.claude/synergy-registry.local.json` is a gitignored companion that overrides
fields in the committed `.claude/synergy-registry.json`. It mirrors the
`settings.local.json` convention used elsewhere in Claude Code: machine-specific
state stays out of version control, while the committed file documents the
shared schema.

```json
[
  {
    "name": "vp-knowledge",
    "local-path": "../vp-claude"
  }
]
```

Resolution rules:

1. Skills first read `.claude/synergy-registry.json`.
2. If `.claude/synergy-registry.local.json` exists, skills read it and merge it
   on top, matching entries by the `name` key. Fields present in `.local.json`
   win; fields absent from `.local.json` keep the value from the base registry.
3. Entries in `.local.json` whose `name` does not appear in the base registry
   are ignored — the base registry remains the authoritative source of which
   siblings exist.

Use this file to record local checkouts that don't follow the `../<name>/`
convention (different parent directory, monorepo subdirectories, CI checkout
paths). Never commit it: it encodes machine-specific paths.

## Lifecycle rules

- SYNERGY files are **permanent** — never delete them. When all entries in a
  section are resolved, restore the `_No entries yet._` placeholder.
- One file per sibling project relationship.
- Stale threshold: individual entries are stale after 3 months without activity.
  A Trend Review entry resets the staleness clock for the entire file.
