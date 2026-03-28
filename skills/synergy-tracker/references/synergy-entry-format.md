# Synergy Entry Format Reference

Reference material for synergy-tracker workflows. See `SKILL.md` for the
workflow steps that reference this document.

## SYNERGY-\*.md file template

```markdown
# SYNERGY-<project-name>

Tracking cross-project synergy with [<project-name>](<url>).

## Shared Patterns

_No entries yet._

## Divergences

_No entries yet._

## Extraction Candidates

_No entries yet._

## They Have / We Don't

_No entries yet._
```

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

1. Start with the project's canonical short name (its repository name)
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
    "bm-entity": "npm/vp-knowledge",
    "relationship": "sibling-plugin"
  }
]
```

| Field | Required | Description |
|---|---|---|
| `name` | yes | Short display name for the related project |
| `file` | yes | Exact filename of the SYNERGY tracking file |
| `remote` | no | Canonical URL for the related project |
| `bm-entity` | no | Basic Memory entity path (skips search when present) |
| `relationship` | no | Free-form label: `sibling-plugin`, `shared-tooling`, `fork`, `consumer` |

If `.claude/synergy-registry.json` does not exist, discover SYNERGY files by
globbing `SYNERGY-*.md`. The registry is optional but recommended for projects
with multiple synergy relationships.

## Lifecycle rules

- SYNERGY files are **permanent** — never delete them. When all entries in a
  section are resolved, restore the `_No entries yet._` placeholder.
- One file per sibling project relationship.
- Stale threshold: individual entries are stale after 3 months without activity.
  A Trend Review entry resets the staleness clock for the entire file.
