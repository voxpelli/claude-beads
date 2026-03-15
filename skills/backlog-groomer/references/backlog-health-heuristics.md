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
- **Near-match**: similar titles (shared keywords), same labels, or references
  to the same commit/file. Use `bd search <keywords>` to surface candidates.
- **Cross-status**: a closed issue may duplicate an open one if the fix was
  incomplete. `bd duplicates` checks within status groups.

When merging, prefer the issue with more context (longer description, more
comments, more dependency links). Use the `bd merge` command if available.

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

| Type | When to assign |
|---|---|
| `bug` | Something broken — unexpected behavior, regression, error |
| `task` | Defined, bounded work — refactoring, docs, test coverage |
| `feature` | New capability — user-facing or developer-facing |
| `chore` | Maintenance — dependency updates, CI config, tooling |
| `epic` | Large feature grouping — 3+ child issues, not directly workable |

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
(Enrich) to add a `## Research Context` section after creation.

## Creation Limits

- **Per-topic cap**: If research (W4) yields >8 candidate issues, suggest splitting
  into multiple research sessions or grouping under a tracking issue
- **Per-session cap**: Creating >15 issues in one grooming session is a signal that
  the topic needs higher-level scoping first (consider an epic)
- **Dedup before create**: Always run `bd search <keywords>` before `bd create` to
  avoid duplicating existing issues
