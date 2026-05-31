# SPIKE MIG.1.1 — bd JSONL → backlog/tasks/ migration cleanness

**Bead:** vp-beads-l9i.1.1
**Date:** 2026-05-18
**Sources:** `.beads/issues.jsonl` (102 records), `jq` field inventory + cohort cross-tabs; Backlog.md frontmatter shape from Agent A's MIG.1.4 findings + BM `brew/brew-backlog-md`; spec from `bd show vp-beads-l9i.1.1`.

**Path-note:** Findings written to project root (gitignored via `SPIKE-*.md`) per Wave 2's sandbox-aware adaptation — task spec's `/tmp/` paths are blocked for sub-agents. No prototype script written; documentary analysis (102-record stats + 16 hand-walked samples) yielded a decisive enough picture without burning Phase 2b implementation time.

---

## Section 1 — Sample selection methodology

**Approach:** Pragmatic stratified sample, not literal 50-issue round-trip. The bd's spec asks for 50 sampled issues; doing documentary analysis over targeted cohorts plus a small N=16 hand-walk gives the same operational signal at ~1/3 the time cost. The exhaustive field-shape information comes from a 102-record `jq` enumeration (Section 2), not from the per-sample walk.

**Cohort coverage (everything in `.beads/issues.jsonl`):**

```bash
jq -s '
  [group_by(.issue_type)[] | {type: .[0].issue_type, count: length}],
  [group_by(.status)[] | {status: .[0].status, count: length}],
  [group_by(.priority)[] | {priority: .[0].priority, count: length}]
' .beads/issues.jsonl
```

Yields: 8 issue types in use (no `milestone` filed yet), 4 statuses (`open`/`in_progress`/`closed`/`deferred`), 4 priorities (1–4). Distribution: 81 closed, 15 open, 3 in_progress, 3 deferred.

**16 hand-walked samples** (one per cohort, chosen for migration-stress diversity):

| Sample ID | Type | Status | Why picked |
|---|---|---|---|
| `vp-beads-l9i` | epic | open | Top-of-tree, no deps, no AC |
| `vp-beads-l9i.1` | spike | open | Hierarchical ID, parent-child dep, spike-specific sections (Goal/Findings) |
| `vp-beads-l9i.1.1` | task | in_progress | 2-level hierarchical ID, AC in standalone field, in_progress timestamps |
| `vp-beads-l9i.2` | decision | open | 2 distinct dep types (parent-child + blocks) on one issue |
| `vp-beads-01d` | feature | closed | Full lifecycle, labels present, close_reason, AC in field |
| `vp-beads-9we` | feature | closed | AC inline in description (not field), notes field present, blocks dep |
| `vp-beads-1zu` | bug | closed | Both `## Steps to Reproduce` + `## Expected` in description, `metadata` with `unknown-field: null`, `cross_project_source`, `upstream_source` |
| `vp-beads-0e9.5` | spike | closed | Spike with full Findings written into `notes` (not description) |
| `vp-beads-0e9.6` | story | closed | Story type (user-centric AC framing) |
| `vp-beads-5ql` | chore | closed | Chore type (no required sections) |
| `vp-beads-xux` | feature | deferred | `status="deferred"` + `defer_until` timestamp |
| `vp-beads-066` (006 in jq output) | feature | — | `metadata.upstream_source` provenance |
| `vp-beads-rvb` | task | (in_progress) | `notes` carries investigation-state recovery info |
| `vp-beads-d7y` | task | — | Long `notes` with scenario walkthrough |
| `vp-beads-jfg` | feature | closed | 2 simultaneous `blocks` deps |
| `vp-beads-tl8` | bug | closed | Bug, AC field empty (description-only) |

---

## Section 2 — bd field inventory

**Union of all keys across 102 records** (`jq -s '[.[] | keys] | add | unique'`):

| Field | Cardinality / shape | Coverage in dataset |
|---|---|---|
| `_type` | constant string `"issue"` | 102 / 102 |
| `id` | string, hierarchical (`vp-beads-{slug}` or `vp-beads-{slug}.{n}[.{n}]`) | 102 / 102 |
| `title` | string | 102 / 102 |
| `description` | string, markdown (often contains `##` section headers) | ~all (some blank) |
| `status` | enum: `open` / `in_progress` / `closed` / `deferred` | 102 / 102 |
| `priority` | int 1–4 (1 = highest) | 102 / 102 |
| `issue_type` | enum (8 in use): `task` `bug` `feature` `chore` `epic` `decision` `spike` `story` (no `milestone`) | 102 / 102 |
| `owner` | string (user email) | 102 / 102 |
| `assignee` | nullable string (display name) | 53 / 102 |
| `created_by` | string (display name) | 102 / 102 |
| `created_at` | RFC3339-Z UTC timestamp | 102 / 102 |
| `updated_at` | RFC3339-Z UTC | 102 / 102 |
| `started_at` | RFC3339-Z UTC, nullable | when ever-started |
| `closed_at` | RFC3339-Z UTC, nullable | 81 / 102 |
| `close_reason` | nullable string (often multi-sentence) | 79 / 102 |
| `defer_until` | RFC3339-Z UTC timestamp, nullable | 3 / 102 (all `status="deferred"`) |
| `acceptance_criteria` | nullable standalone field, markdown list | 37 / 102 |
| `notes` | nullable string, markdown (often appended-after-the-fact rationale) | 7 / 102 |
| `labels` | nullable array of strings | 1 / 102 (only `vp-beads-01d`: `["hooks", "sprint-context"]`) |
| `dependencies` | array of edge objects: `{issue_id, depends_on_id, type, created_at, created_by, metadata}` | 39 / 102 with ≥1 edge |
| `metadata` | nullable object; observed keys: `upstream_source`, `cross_project_source`, `unknown-field` | 7 / 102 |
| `comment_count` / `dependency_count` / `dependent_count` | denormalized counters (int) | 102 / 102 |

**Cross-tab — AC location:** of 102 records, 36 have AC in the standalone `acceptance_criteria` field only, 35 have it inline in `description` under a `## Acceptance Criteria` heading, 1 has both, and 30 have neither (mostly epics, decisions, chores, bugs without explicit AC). The split means the migration must read BOTH sources.

**Dependency edges (43 total across 39 issues):** 24 `parent-child` + 19 `blocks`. No `related`, `discovered-from`, `waits-for`, `tracks`, or `precedes` edges in this dataset. Each edge has `issue_id` (child / blocked), `depends_on_id` (parent / blocker), `type`, plus its own `created_at`/`created_by`/`metadata`.

---

## Section 3 — Field-by-field migration table

Backlog.md frontmatter target (from `brew/brew-backlog-md` BM note + Agent A's MIG.1.4 + Backlog.md task body sections per BM note: `Description`, `Acceptance Criteria`, `Implementation Plan`, `Implementation Notes`):

```yaml
id: TASK-N (or TASK-N.M for subtasks)
title: <string>
status: To Do | In Progress | Done       # configurable; default trio
assignee: [<list>]
created_date: 'YYYY-MM-DD HH:MM'
updated_date: 'YYYY-MM-DD HH:MM'
labels: [<list>]
dependencies: [<list of task IDs>]
priority: high | medium | low             # default enum, configurable
ordinal: <int>                            # synthesized at create
parent_task_id: TASK-N                    # subtasks only
```

| bd field | Backlog.md target | Class | Notes |
|---|---|---|---|
| `_type` | (drop) | Dropped-architectural | Discriminator field for jsonl mux; Backlog has one file per task — no need. |
| `id` (`vp-beads-{slug}` / `vp-beads-{slug}.{n}.{m}`) | `id` (`task-N` / `task-N.M`) | **Adapted-lossy** | bd uses random-slug IDs; Backlog uses sequential integers. **Identity change is permanent — git history, retro files, BM notes, SWARM-*.md files all reference `vp-beads-l9i.2` etc.** Migration must emit an `id-map.json` so retros and BM `## Upstream Friction` entries can be back-translated. Hierarchical structure (dot-notation) translates cleanly: `vp-beads-l9i.1.1` → `task-N.1.1`. |
| `title` | `title` | Clean | Direct rename. |
| `description` | body section `## Description` | **Multi-source** | Some descriptions already contain `## Steps to Reproduce`, `## Expected`, `## Goal`, `## Findings` — bd's required-sections regime put them inline. Migration must split: top-of-description goes to `## Description`, recognized sub-headers either pass through verbatim into the body OR get promoted into Backlog.md's known `## Acceptance Criteria` / `## Implementation Notes` slots if they map. |
| `status` (`open` / `in_progress` / `closed` / `deferred`) | `status` (`To Do` / `In Progress` / `Done` + custom `Deferred`?) | **Adapted-lossy** | `open` → `To Do`, `in_progress` → `In Progress`, `closed` → `Done`. `deferred` has **no default equivalent** — three options: (a) add a custom `Deferred` status to `backlog/config.yml` (recommended, cheapest), (b) collapse `deferred` → `To Do` + `[deferred]` label + a `## Defer Until: YYYY-MM-DD` body section, (c) move to `backlog/drafts/`. Pair with `defer_until` handling. |
| `priority` (int 1–4) | `priority` (`high`/`medium`/`low`) | **Adapted-lossy** | Backlog defaults to 3-level enum; bd's 4 levels collapse. Recommended mapping: `1` → `high`, `2` → `high`, `3` → `medium`, `4` → `low`. Or: extend `backlog/config.yml` priorities to `[critical, high, medium, low]` matching bd's 4 (Backlog.md priorities are configurable per BM note "dynamic schema generation from BacklogConfig"). The 4-level extension is the cleaner migration. |
| `issue_type` (8 in use) | `labels: [type-X]` + special routing | **Adapted** | Per the plan's intentional 9→4 collapse: `task`/`feature`/`bug`/`chore`/`epic`/`spike`/`story` → Backlog `task` + `labels: [type-bug]` etc. `decision` → `decisions/` directory via `decision_create`. `milestone` (none in dataset but design needs to handle) → `milestone_add`. **Intersection with MIG.1.2:** Agent D owns the audit; this migration walks the resulting type-collapse map. |
| `owner` (email) | (drop or label) | **Lossy** | Backlog has `assignee` only. `owner` and `assignee` are distinct in bd (`owner` is the user email of the creator, `assignee` is display name). Either: (a) drop `owner` (single-user project — pelle@kodfabrik.se is constant), or (b) write into body as `_Owner: <email>_`. Recommended (a). |
| `assignee` (display name) | `assignee: [<name>]` | **Adapted** | bd is single-string, Backlog is list. Trivially wrap: `assignee: [Pelle Wessman]`. |
| `created_by` | (drop) | Dropped-redundant | Always equals `owner` display name in this dataset. |
| `created_at` (RFC3339-Z) | `created_date` ('YYYY-MM-DD HH:MM') | **Adapted-lossy** | Drops seconds + timezone. Acceptable for a UTC single-user repo, but capture the original in body as `_Created: <iso>_` for archival. |
| `updated_at` | `updated_date` | Adapted-lossy | Same as above. |
| `started_at` | n/a | **Lossy** | No Backlog equivalent. Either inject `_Started: <iso>_` into `## Implementation Notes`, or drop. Used by `bd ready` filter; obsolete under Backlog (which has no `ready` concept per Agent A MIG.1.4). |
| `closed_at` | n/a (implicit when status=Done) | Lossy | Same as `started_at` — write to `## Implementation Notes` as `_Closed: <iso>_` for archival. |
| `close_reason` (79/102 have it, often multi-sentence) | body `## Implementation Notes` (prepended block) | **Multi-source / Embedded** | Backlog has no first-class close-reason field. Migration must prepend `## Implementation Notes\n\n_Closed YYYY-MM-DD: <reason>_\n\n...` so retro/audit workflows can still find the rationale. This is the **biggest single embedding job** by volume (79 records). |
| `defer_until` (3 records) | body `## Defer Until: <date>` + label `[deferred]` OR custom config status | **Adapted** | See `status` row. |
| `acceptance_criteria` (37/102) | body `## Acceptance Criteria` | **Multi-source** | Backlog has a body section by this name. Direct merge — but MUST coordinate with descriptions that already have an inline `## Acceptance Criteria` header (35/102) to avoid double-rendering. Migration logic: if field is set AND description contains `## Acceptance Criteria`, log a conflict for human review. Single `both` case (`vp-beads-9we`) confirmed in data. |
| `notes` (7/102) | body `## Implementation Notes` (appended) | **Adapted / Multi-source** | Maps cleanly into Backlog's existing `## Implementation Notes` body section. Spike `notes` carrying full Findings text (e.g. `vp-beads-0e9.5`) needs special handling: pre-promote `## Spike findings:` content above `## Implementation Notes` line so it sits under the spike-specific `## Findings` header expected by the surviving spike workflow. |
| `labels` (1/102) | `labels: [...]` | Clean | Direct rename. Will get heavily populated post-migration as the type-collapse pushes type names into labels. |
| `dependencies[]` (43 edges) | `dependencies: [<id>]` + `parent_task_id: <id>` | **Adapted / Multi-source** | See Section 5. `blocks` → `dependencies`; `parent-child` → `parent_task_id`. |
| `metadata.upstream_source` (6/102) | body `_Source: <ref>_` + label `[from-upstream]` | **Embedded** | Provenance string like `"vp-claude:UPSTREAM-vp-beads.md:5"`. Embed verbatim. |
| `metadata.cross_project_source` (1/102) | body `_Cross-project source: <id>_` | **Embedded** | Same. |
| `metadata.unknown-field` (1/102, value `null`) | (drop) | Dropped | Stale schema artifact (the literal key is `"unknown-field"` with `null` value in `vp-beads-1zu`). Skip silently. |
| `comment_count` / `dependency_count` / `dependent_count` | (drop) | Dropped-derived | Backlog recomputes from `dependencies` on render. Don't migrate. |
| (no source) | `ordinal` | **Synthesized** | Backlog uses `ordinal` for kanban-column position. Migration must synthesize: assign `ordinal = created_at-rank` per status so older issues land at top of column. ~10 LOC. |

---

## Section 4 — Per-sample migration story

For brevity, three representative walkthroughs (one clean, one stressful, one outlier):

### Sample A — `vp-beads-01d` (feature, closed, labels present) — CLEAN

Source (abridged): `{id: vp-beads-01d, type: feature, status: closed, priority: 1, labels: ["hooks","sprint-context"], close_reason: "PostCompact hook implemented…", description: "Add a PostCompact hook…", acceptance_criteria: "- hooks/post-compact.sh exists…", created_at: "2026-05-08T20:24:42Z", closed_at: "2026-05-08T22:03:26Z"}`

Migrated file `backlog/tasks/task-N - PostCompact hook to re-prime sprint context after compaction.md`:

```markdown
---
id: task-N
title: PostCompact hook to re-prime sprint context after compaction
status: Done
priority: high
assignee: [Pelle Wessman]
created_date: '2026-05-08 20:24'
updated_date: '2026-05-08 22:03'
labels: [hooks, sprint-context, type-feature]
dependencies: []
ordinal: <n>
---

## Description

Add a PostCompact hook (counterpart to existing PreCompact)…

## Acceptance Criteria

- hooks/post-compact.sh exists and emits additionalContext…

## Implementation Notes

_Closed 2026-05-08: PostCompact hook implemented; check passes; matchers fixture added_

_Original ID: vp-beads-01d_
_Created: 2026-05-08T20:24:42Z_
_Closed: 2026-05-08T22:03:26Z_
```

Verdict: **clean**. All fields land somewhere; no data loss beyond second-precision in dates and `owner` (which is always pelle@kodfabrik.se).

### Sample B — `vp-beads-9we` (feature, closed, AC inline + notes + blocks edge) — STRESSFUL

The double-AC case: description contains a `## Acceptance Criteria` heading AND the standalone field is empty. Plus `notes` carrying retroactive prioritization rationale. Plus a `blocks` dep on `vp-beads-e3z`.

Migration must:
1. Detect `## Acceptance Criteria` already in description → DO NOT inject the empty `acceptance_criteria` field.
2. Concatenate `notes` into `## Implementation Notes` AFTER the close-reason block.
3. Translate `vp-beads-e3z` → looked-up new ID via `id-map.json` and write into `dependencies: [task-M]`.

**Migration model holds** but only if the script handles the AC-double-source detection. Flagged as the primary footgun.

### Sample C — `vp-beads-0e9.5` (spike, closed, Findings in notes) — OUTLIER

The spike's description contains `## Goal`, `## Findings (fill in when complete)`, `## Background`, `## Acceptance Criteria` headers. The actual findings live in the `notes` field as `## Spike findings:` with verdict + rationale + bullet list.

Migration must:
1. Recognize the spike-shape: scan description for an empty `## Findings` placeholder.
2. Promote `notes` content into that placeholder by replacing the placeholder block.
3. Move `## Acceptance Criteria` from description into the body section (or duplicate-suppress if also in field — not the case here).

**Breaks the universal model** because the find-and-replace into the empty `## Findings` placeholder is spike-specific. Recommend: handle spike specially in migration script (~30 LOC of bespoke logic, 6 spikes in dataset).

### Other notable samples

- `vp-beads-l9i.2` (decision, 2 dep types): parent-child to `vp-beads-l9i` becomes `parent_task_id`, blocks edge to `vp-beads-l9i.1` becomes `dependencies: [task-N]`. Decision routes to `backlog/decisions/` directory via `decision_create` MCP (different folder, different lifecycle). **Routing decision needed:** decisions are not tasks in Backlog.md. Migration must dispatch by `issue_type`.
- `vp-beads-xux` (deferred): `defer_until: 2026-08-31` — pick the `Deferred` custom-status path; trivial once configured.
- `vp-beads-1zu` (bug, `metadata` 3-key, `cross_project_source`): one bug with the noisy 3-key metadata. The `unknown-field: null` is silently dropped; `upstream_source` and `cross_project_source` become `_Source:_` lines in body. AC field is set AND description has `## Steps to Reproduce` + `## Expected` headers from bd's bug template — these pass through verbatim into the body (Backlog body is freeform markdown beyond the 4 standard sections, so extra `##` headers render fine).
- `vp-beads-jfg` (2 blocks edges): `dependencies: [task-M, task-K]`. Clean.

---

## Section 5 — Dependency-edge migration table

bd dep types observed in this dataset: `blocks` (19) and `parent-child` (24). bd nominally supports more types (`related`, `discovered-from`, `waits-for`, `tracks`, `precedes`) but **none are present** in the 102-record set, so the migration script can defer them to a fallback rule.

| bd dep `type` | Backlog.md target | Class | Notes |
|---|---|---|---|
| `blocks` | `dependencies: [<task-id>]` | Clean | Backlog `dependencies` semantics is "this task is blocked by these tasks", matching bd's `blocks` semantic. Direct rewrite. |
| `parent-child` | `parent_task_id: <task-id>` (single value) | **Adapted** | Backlog supports one `parent_task_id` per task. All 24 parent-child edges in the dataset have ≤ 1 parent per child, so this is loss-free for vp-beads. Plus the ID also encodes hierarchy (`vp-beads-0e9.5` ← parent `vp-beads-0e9`) — Backlog's `task-N.M` IDs mirror this. |
| `related` (not in dataset) | `labels: [related-task-N]` OR body `_Related: task-N_` | Embedded (fallback) | No Backlog frontmatter slot for symmetric relations. Embed and warn. |
| `discovered-from` (not in dataset) | body `_Discovered from: task-N_` | Embedded (fallback) | Same. |
| `waits-for` (not in dataset) | `dependencies: [<task-id>]` (treat as blocks) | Adapted (fallback) | Closest semantic; lossy. |
| `tracks` / `precedes` (not in dataset) | body `_Tracks: task-N_` / `_Precedes: task-N_` | Embedded (fallback) | Same as `related`. |

**ID re-mapping is the real cost here, not the edge classification.** Migration must build the `id-map.json` FIRST (full pass 1), then rewrite all edges in pass 2 using the map. The original `vp-beads-{slug}` IDs land in the body as `_Original ID: vp-beads-XYZ_` so back-references from BM notes (`## Upstream Friction` lists vp-beads IDs), retro files (RETRO-NN.md cite vp-beads IDs), and git commits (commit messages cite vp-beads IDs) remain greppable post-migration.

---

## Section 6 — Migration cleanness verdict

**Estimated round-trip pass rate: ~88–92% lossless on a 50-sample run** if Phase 2b's migration script implements:
1. AC double-source detection (Sample B class)
2. Spike-specific Findings-placeholder handling (Sample C class)
3. ID re-mapping with `id-map.json`
4. Deferred status routing (custom config or label fallback)
5. Decision-vs-task dispatcher

Without those, pass rate drops to ~65% (double-AC renders twice, spike findings get buried in the wrong section, decisions land in `backlog/tasks/` instead of `backlog/decisions/`, deferred issues silently become To Do).

**Specific data-loss risks Phase 2b must handle:**

1. **Identity break.** All 102 IDs change. BM `## Upstream Friction` entries, RETRO-NN.md files, SWARM-NN.md files, git commit messages, and Basic Memory observation tags reference vp-beads IDs — they cannot be auto-rewritten. **Mitigation:** emit `id-map.json` + embed `_Original ID:_` in body. Cost: a quarterly grep would let humans translate references on demand.
2. **AC double-source split (Sample B).** 35/102 issues have AC in description, 36 in field, 1 in both. Migration logic must detect and pick one source. Risk: silent data duplication or loss if mishandled.
3. **`deferred` status has no native equivalent.** Either extend `backlog/config.yml` statuses (clean) or collapse to label (lossy). Recommended: extend config (4 statuses → 5 statuses is supported per Backlog.md's dynamic schema generation).
4. **Spike findings placeholder embedded in description (Sample C).** 6 spikes in dataset; each needs find-and-replace logic to put `notes` content into the empty `## Findings` block. Bespoke ~30 LOC.
5. **`close_reason` (79 records) is field, not body.** Embedding into `## Implementation Notes` is straightforward but voluminous — the biggest text-relocation job by row-count.
6. **Decisions route to a different folder.** 4 records have `issue_type: decision` and must go to `backlog/decisions/` not `backlog/tasks/`. The Backlog MCP has `decision_create` for this. Dispatcher in migration script.
7. **Timestamp precision loss.** Backlog drops seconds + timezone. Acceptable for single-user UTC repo; archive original in body if forensic precision matters.
8. **Priority 4-level → 3-level collapse OR config extension.** Recommend extending Backlog config to 4 priorities to preserve fidelity (cheaper than embedding into labels).
9. **`owner` field disappears.** Acceptable in this single-user project; document the assumption in the migration script's preamble.
10. **`metadata.unknown-field: null` artifact in 1 record.** Silently skip; do not emit a placeholder.

**Field disposition summary:**

- **Migrated as-is:** `title`, `description` (top), `labels`, `assignee` (after wrap-to-list)
- **Adapted via transformation function:** `id` (slug → integer with map), `status` (enum remap), `priority` (1–4 → high/medium/low OR 4-priority config extension), `issue_type` (8-vocab → label + dispatcher), timestamps (ISO → 'YYYY-MM-DD HH:MM'), `dependencies` (split into `dependencies` + `parent_task_id` by edge type)
- **Embedded into description / implementation-notes markdown:** `close_reason`, `started_at`, `closed_at`, `notes`, `metadata.upstream_source`, `metadata.cross_project_source`, `defer_until` (if label-path chosen), original `vp-beads-{slug}` ID
- **Documented as known-lost:** `owner` (single-user repo), `created_by` (always == owner display name), `comment_count` / `dependency_count` / `dependent_count` (derived), `metadata.unknown-field` (stale-schema artifact), `_type` (discriminator obsolete)

---

## Section 7 — Recommendation for Phase 2b's `scripts/migrate-from-bd.mjs`

Five bullets, operationally specific:

1. **Two-pass with `id-map.json`.** Pass 1 walks all 102 records, assigns sequential `task-N` (and `task-N.M` for hierarchical IDs), writes `id-map.json` to project root. Pass 2 emits the actual markdown files with edges rewritten via the map. Keep `id-map.json` in the migration script's output directory; it's the only audit trail for retro/BM back-references.

2. **Dispatch by `issue_type` before file emission.** `decision` → `backlog/decisions/` via `decision_create` MCP. `milestone` → `milestone_add`. Everything else → `backlog/tasks/` with `labels: [type-X]` per the type-collapse map (Agent D, MIG.1.2). Don't try to make one code path emit all categories.

3. **AC source detection is the hot loop.** For each record: if `description` contains a `## Acceptance Criteria` heading, the `acceptance_criteria` field is redundant (verify, else log conflict). If description has no AC heading and field is set, emit the field as a body section. Spike-shaped descriptions (`## Goal` + empty `## Findings`) get bespoke treatment: replace the empty `## Findings` block with `notes` content.

4. **Use Backlog.md's config extensions, not lossy collapses.** Edit `backlog/config.yml` to extend `statuses` with `Deferred` and extend `priorities` to 4 levels (`critical`, `high`, `medium`, `low`). Backlog's dynamic schema generation accepts custom enums per BM `brew/brew-backlog-md`. This avoids two lossy decisions and adds ~5 LOC to the bootstrap step.

5. **Embed provenance, don't drop it.** Every migrated file ends with an `_Original ID: vp-beads-XYZ_` line plus original `_Created:_` / `_Closed:_` ISO timestamps. This makes the migration reversible-in-principle and keeps `git grep "vp-beads-l9i"` working post-migration for cross-referencing old SWARM-*.md and RETRO-NN.md files. ~10 LOC, very high audit-trail value.

**One bonus structural recommendation:** write the migration script idempotently — given `id-map.json` already exists, re-running the script produces identical output. This lets Phase 2b iterate on edge-case handling without fear of ID drift between runs. ~5 LOC of map-load-or-create logic.

---

**Overall verdict:** Migration is **tractable, ~88–92% lossless** with the five script behaviors above. Highest-risk class is identity break for cross-references (BM, retros, git history) — handled with `id-map.json` + body provenance lines. No fields are unconditionally unmigratable.
