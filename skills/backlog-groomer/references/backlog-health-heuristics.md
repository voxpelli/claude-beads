# Backlog Health Heuristics

Reference material for backlog-groomer workflows. See `SKILL.md` for the
workflow steps.

## Staleness Thresholds

An issue is **stale** when it meets ALL of these:

- Status is `open` (not `in_progress` or `closed`)
- Not updated in the last 60 days (`bd stale --days 60` — grooming default,
  stricter than `bd stale`'s 30-day default to reduce noise from recently
  created items not yet started)
- No commits reference the issue ID in `git log`

Issues that are `in_progress` but stale (>30 days without activity) may be
abandoned — flag separately as "stalled, not stale."

## Closure Criteria

An issue is a **closure candidate** when ANY of these apply:

- **Addressed by commit**: a recent `git log` entry mentions the issue topic
  or fixes the described problem, but the issue was never formally closed
- **Superseded**: a newer issue covers the same scope with better description
  or broader scope — close the older one with a reference to the replacement
- **Out of scope**: the project direction has shifted and the issue is no longer
  relevant (user must confirm — never auto-close based on scope inference)
- **Stale beyond recovery**: open >120 days, no activity, P3/P4 priority, no
  blocking relationship — the backlog has moved on

## Duplicate Detection

Duplicates are issues that describe the same work. Check for:

- **Exact match**: `bd duplicates` finds issues with identical content hashes
- **Near-match (mechanical)**: `bd find-duplicates` (alias `find-dups`) with
  the default `--method=mechanical` runs Jaccard tokenization across open
  issues. Free, fast, no API calls.
- **Near-match (semantic)**: `bd find-duplicates --method=ai` uses Claude to
  compare candidate pairs that survive mechanical pre-filtering. Requires
  `ai.api_key` config and **bills per call**. Opt-in only.
- **Manual**: similar titles (shared keywords), same labels, or references to
  the same commit/file. Use `bd search <keywords>` to surface candidates.
- **Cross-status**: a closed issue may duplicate an open one if the fix was
  incomplete. `bd duplicates` checks within status groups.

### Threshold guidance for `bd find-duplicates`

| Threshold | When to use |
|---|---|
| `0.5` (default) | Balanced — catches obvious near-duplicates with low false-positive rate |
| `0.4` | More recall — surfaces fuzzier matches; useful for small backlogs (<100 open) where reviewing extras is cheap |
| `0.6+` | Higher precision — when you only want strong candidates and don't want to review borderline pairs |

### AI cost caveat

`--method=ai` bills per AI call against the configured `ai.api_key`. The
mechanical pre-filter narrows the candidate set first, so cost scales with
the number of mechanical near-matches, not the size of the backlog. Still:
default to mechanical, only invoke `--method=ai` when the user explicitly
requests it or the `BD_AI_DUPES=1` environment variable is set, and surface
an estimated cost when the candidate set is large.

### Resolving duplicates

When merging, prefer the issue with more context (longer description, more
comments, more dependency links). Apply per-pair recommendations using:

- `bd supersede <loser> <winner>` — closes the loser as superseded, preserves
  the link in history (preferred when both have meaningful comments/refs)
- `bd duplicate <loser> <winner>` — marks loser as a duplicate without losing
  the relationship metadata

## Priority Assignment Logic

| Priority | When to assign |
|---|---|
| P0 (critical) | Blocks all development: broken builds, data loss, security |
| P1 (high) | Major feature, important bug, blocks other high-priority work |
| P2 (medium) | Default. Nice-to-have feature, non-critical bug, quality improvement |
| P3 (low) | Polish, optimization, minor friction. No urgency signal |
| P4 (backlog) | Future idea, exploration, "someday maybe" |

**Reprioritization signals:**
- Issue blocks N other issues → raise priority (blocking power)
- Issue has been P4 for 3+ sprints with no interest → candidate for closure
- Issue aligns with stated sprint goal → raise to P1/P2
- Issue conflicts with current direction → lower or close

## Type Assignment Logic

| Type | Required markdown sections | When to use |
|---|---|---|
| `task` | none | Defined, bounded work — refactoring, docs, test coverage (default) |
| `bug` | `## Steps to Reproduce`, `## Acceptance Criteria` | Something broken — unexpected behavior, regression, error |
| `feature` | `## Acceptance Criteria` | New system capability (system-centric framing) |
| `chore` | none | Maintenance — dependency updates, CI config, tooling (no behavior change) |
| `epic` | `## Success Criteria` | Large body of work that decomposes into child issues |
| `decision` | `## Decision`, `## Rationale`, `## Alternatives Considered` | Architecture decision record (ADR) — outcome of deliberation |
| `spike` | `## Goal`, `## Findings` | Timeboxed investigation that reduces uncertainty before a story |
| `story` | `## Acceptance Criteria` | User-centric framing of a feature ("As a X, I want Y...") |
| `milestone` | none | Release boundary or sprint marker — contains no work itself |

All required sections are enforced by `validation.on-create=error` — a
`bd create` will fail if the description is missing the literal markdown
headings listed above. The authoritative source is the
`### Issue Types (Core Vocabulary)` section of the Basic Memory note
`brew/brew-beads`.

**Picking between similar types:**

- `task` vs `chore` — does it change user-visible behavior? Behavior change → task; pure maintenance → chore
- `feature` vs `story` — system-centric vs user-centric framing of the same change. Both are valid; the distinction is audience
- `epic` vs `milestone` — epics ARE work (decompose into children); milestones are markers (contain no work)
- `spike` vs `decision` — spike is the investigation; decision is the recorded outcome. `spike → decision` is a common pair

## Issue Title Convention

Format: `[Area] Action verb + subject`

Examples:
- `[auth] Add OAuth2 provider configuration`
- `[db] Fix migration ordering for tenant tables`
- `[ci] Enable shellcheck for hook scripts`
- `[upstream-tracker] Support non-npm tool types`

The area prefix makes issues scannable in `bd list` output.

## Issue Description Template

```
**Problem:** What is wrong or missing, in 1-2 sentences.

**Why it matters:** Impact on the project or users.

**Suggested first step:** A concrete action to start with.
```

Keep descriptions concise. If the issue needs extensive context, use workflow 6
(Enrich an existing issue) to add a `## Research Context` section after creation.

## Creation Limits

- **Per-topic cap**: If research (workflow 4 (Investigate topic as spike)) yields >8 candidate issues, suggest splitting
  into multiple research sessions or grouping under a tracking issue
- **Per-session cap**: Creating >15 issues in one grooming session is a signal that
  the topic needs higher-level scoping first (consider an epic)
- **Dedup before create**: Always run `bd search <keywords>` before `bd create` to
  avoid duplicating existing issues
