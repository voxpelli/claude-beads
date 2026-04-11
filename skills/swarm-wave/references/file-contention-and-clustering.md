# File Contention and Clustering

Reference material for swarm-wave workflow 1 (Plan a swarm sprint) and
workflow 4 (Map file contention). See `SKILL.md` for the workflow steps.

## Contention Thresholds

| Issues Touching File | Level | Action |
|---|---|---|
| 1 | LOW | No constraint — assign to any wave |
| 2 | MEDIUM | Prefer separate waves; same wave OK if functions are non-overlapping |
| 3+ | HIGH | Must separate into different waves |

## Two-Tier Contention Model

**File-level contention** (default): two issues that modify the same file are
in contention regardless of what they change within it.

**Section-level contention** (for files with 500+ lines): use function or class
boundary analysis. Two issues in contention at the file level may be compatible
in the same wave if they modify non-overlapping sections. Assign explicit
line-range ownership in each agent's prompt. Risk: git merges may still be
needed — only use when sections are clearly independent (e.g., separate
exported functions with no shared state).

## Hot File Strategies

When a file has HIGH contention (3+ issues):

1. **Sequence waves** — put one issue per wave; each wave builds on the prior
   commit. Safest approach.
2. **Section splitting** — assign non-overlapping sections to agents in the
   same wave (section-level only, for files with 500+ lines). Requires
   function-level map with line ranges.
3. **Refactor first** — if all issues converge on a single function, create
   a prep issue that splits or extracts the function before the parallel
   issues run.
4. **Consolidate** — if 3+ issues touch the same small function with related
   changes, create a single combined issue for one agent.

## Priority Ordering

Apply this ordering when clustering issues into waves:

1. P0/P1 issues into Wave 1 (critical work unblocks everything else)
2. P2 issues fill remaining Wave 1 slots and Wave 2
3. P3/P4 issues fill later waves or are deferred

Issues that block other issues (detect with `bd blocked`) must go in an
earlier wave than their dependents.

## Wave Size by RAM

For agent count ceilings by RAM, see `agent-concurrency-limits.md`.

Code agent ceiling is 6 regardless of RAM — more agents increase merge
coordination cost faster than they increase throughput.

## File-to-Issue Inference

When a beads issue description does not list explicit files:

1. Extract identifiers (function names, type names, constants) from the
   description
2. `Grep` those identifiers against the source tree
3. Infer modified files from grep matches + test files that import those
   modules
4. For issues with no grep anchors: default to "unknown scope" and assign
   to their own wave (single-agent waves are safe)
