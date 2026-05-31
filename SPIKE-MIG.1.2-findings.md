# SPIKE-MIG.1.2 — 9→4 type collapse audit

**Sprint:** SWARM-15 Wave 2 (informs Phase 2b, not the verdict)
**Bead:** `vp-beads-l9i.1.2`
**Date:** 2026-05-18
**Corpus:** `.beads/issues.jsonl` (102 beads)
**Charter:** plan §"4 v1-design errors corrected" #2 — collapse bd's 9 types to Backlog.md's 4 (`task / doc / decision / milestone`)

---

## Section 1 — Type distribution verification

`jq -r '.issue_type' .beads/issues.jsonl | sort | uniq -c | sort -rn`

| Type | Count | Required sections (per CLAUDE.md) |
|---|---|---|
| `task` | 35 | `## Acceptance Criteria` |
| `feature` | 31 | `## Acceptance Criteria` |
| `bug` | 14 | `## Steps to Reproduce`, `## Acceptance Criteria` |
| `spike` | 6 | `## Goal`, `## Findings` |
| `story` | 5 | `## Acceptance Criteria` |
| `chore` | 5 | *(none)* |
| `decision` | 4 | `## Decision`, `## Rationale`, `## Alternatives Considered` |
| `epic` | 2 | `## Success Criteria` |
| `milestone` | 0 | *(none — vp-beads has none in the corpus)* |

Total = 102. Matches priming brief except `task` is 35 (not 30) because 5 of the 8 new MIG beads are task-typed.

### Distinct field shapes per type

Top-level JSONL keys (`jq -r 'keys[]' | sort -u`) for every record:

```
_type, acceptance_criteria, assignee, close_reason, closed_at, comment_count,
created_at, created_by, defer_until, dependencies, dependency_count,
dependent_count, description, id, issue_type, labels, metadata, notes,
owner, priority, started_at, status, title, updated_at
```

Schema is uniform — no per-type optional fields. Type-specific structure lives inside the **`description`** markdown body (and, rarely, in the standalone `acceptance_criteria` field).

### `acceptance_criteria` standalone field — usage pattern

37 issues populate `acceptance_criteria`. Of those, **36/37 do NOT also embed `## Acceptance Criteria` in `description`** — the field is the SOLE home of AC for those issues. The one exception (`vp-beads-rvb`) duplicates.

Distribution of issues with non-empty `acceptance_criteria`:

| Type | Count with AC field |
|---|---|
| `task` | 19 |
| `feature` | 17 |
| `bug` | 1 |

`bug`-required `## Steps to Reproduce` always lives in `description` (no standalone field). Same for `spike`'s `## Goal` + `## Findings`, `epic`'s `## Success Criteria`, and `decision`'s three sections — **all required sections except AC live exclusively inside `description`.**

### Required-section presence audit (corpus-wide)

`jq -r 'select(.issue_type=="bug") | ...test("## Steps to Reproduce")...'`

| Type | Sample size | Has required section in `description` |
|---|---|---|
| `bug` (Steps to Reproduce) | 14 | 6/14 = 43% |
| `bug` (AC in desc OR field) | 14 | 7/14 = 50% |
| `spike` (`## Goal`) | 6 | 6/6 = 100% |
| `spike` (`## Findings`) | 6 | 6/6 = 100% |
| `epic` (`## Success Criteria`) | 2 | 2/2 = 100% |
| `decision` (all 3 sections) | 4 | 4/4 = 100% |

**Observation:** 8 of 14 `bug` issues PRE-DATE the v1.0.5+ tightening of `validation.on-create=error` and lack required sections entirely. New bugs filed post-validation (the 6 recent ones) have the sections. This is a pre-existing corpus-quality issue, not a migration concern — but the migration script should not assume every bug has steps-to-repro.

---

## Section 2 — 12 samples + per-sample mapping

### Sample bugs

#### `vp-beads-tl8` (closed)
- **Title:** sibling-sync: 'They Have / We Don't' section is intrinsically asymmetric…
- **Fields:** `description` contains rich prose **plus** explicit `## Steps to Reproduce` and `## Acceptance Criteria` sections; `acceptance_criteria` field empty; no `labels`.
- **Proposed Backlog.md task:**
  ```yaml
  id: BACK-tl8
  title: "sibling-sync: 'They Have / We Don't' section is intrinsically asymmetric…"
  status: Done
  labels: [bug]
  ```
  Body = `description` as-is (sections survive verbatim).
- **Classification:** **CLEAN.** AC + steps-to-repro are already markdown headings inside `description`; they round-trip with zero transformation. Status `closed`→`Done`.

#### `vp-beads-qqj` (closed)
- **Title:** fix(validate-plugin): empty-name guard in SYNERGY filename consistency check
- **Fields:** `description` contains `## Steps to Reproduce` + `## Acceptance Criteria`; no AC field; no labels.
- **Proposed:** identical pattern to tl8 with `labels: [bug]`. **CLEAN.**

### Sample features

#### `vp-beads-01d` (closed)
- **Title:** PostCompact hook to re-prime sprint context after compaction
- **Fields:** `description` is prose **without** `## Acceptance Criteria` heading; the AC lives in the standalone `acceptance_criteria` field (6 bullets); `labels: [hooks, sprint-context]`.
- **Proposed Backlog.md task:**
  ```yaml
  id: BACK-01d
  title: PostCompact hook to re-prime sprint context after compaction
  status: Done
  labels: [feature, hooks, sprint-context]
  ```
  Body = `description` + appended `## Acceptance Criteria\n<bullets-from-AC-field>` (migration script synthesizes the heading from the field).
- **Classification:** **REQUIRES-ADAPTATION** (field→section synthesis). Migration script MUST concatenate; otherwise AC is silently dropped.

#### `vp-beads-9we` (closed)
- **Title:** feat(validate-plugin): convention check for naked workflow N references…
- **Fields:** `description` already contains `## Acceptance Criteria` inline (sole owner); AC field empty.
- **Proposed:** `labels: [feature]`, body = description verbatim. **CLEAN.**

### Sample chores

#### `vp-beads-99b` (closed)
- **Title:** chore: add MIT LICENSE file
- **Fields:** 2-sentence description, no AC, no labels.
- **Proposed:** `labels: [chore]`, body = description. **CLEAN.** Chore type has no required sections in bd; no information loss.

#### `vp-beads-0tq` (closed)
- **Title:** docs: reconcile RETRO numbering drift…
- **Fields:** prose-only description with embedded numbered decisions; no AC; no labels.
- **Proposed:** `labels: [chore]` (or `[chore, docs]` — title prefix `docs:` is conventional-commit scope, not a bd type). **CLEAN.**

### Sample stories

#### `vp-beads-0e9.6` (closed)
- **Title:** Story: adopt spike/story/milestone vocabulary in vp-beads skills and docs
- **Fields:** `description` has structured sections `## User Story` + `## Background` + `## Acceptance Criteria`; no AC field; parent edge to `vp-beads-0e9`.
- **Proposed:**
  ```yaml
  id: BACK-0e9.6
  title: "Story: adopt spike/story/milestone vocabulary…"
  status: Done
  labels: [story]
  dependencies: [BACK-0e9]   # parent-child edge → dependency
  ```
  Body = description verbatim.
- **Classification:** **CLEAN.** Story's `## User Story` + `## Acceptance Criteria` are just markdown headings — they survive. The `parent-child` dep-type maps to Backlog.md's `dependencies` frontmatter array. (Caveat: Backlog.md's `dependencies` field is flat, not typed — `parent-child` vs `blocks` distinction is LOST. See §3.)

#### `vp-beads-0e9.7` (closed)
- **Title:** Story: add `bd find-duplicates` to backlog-groomer triage workflow
- **Fields:** same shape as 0e9.6 (User Story / Background / AC sections).
- **Proposed:** identical pattern. **CLEAN.**

### Sample spikes

#### `vp-beads-0e9.4` (closed)
- **Title:** Spike: bd gate for inter-wave coordination in swarm-wave
- **Fields:** `description` has `## Goal` + `## Findings` + `## Background` + `## Acceptance Criteria`; parent edge to 0e9.
- **Proposed:**
  ```yaml
  id: BACK-0e9.4
  title: "Spike: bd gate for inter-wave coordination…"
  status: Done
  labels: [spike]
  dependencies: [BACK-0e9]
  ```
  Body = description verbatim.
- **Classification:** **CLEAN.** All 4 sections (`## Goal`, `## Findings`, `## Background`, `## Acceptance Criteria`) ride in description as plain markdown.

#### `vp-beads-l9i.1` (open, current spike)
- **Title:** Backlog.md spike: empirical evaluation against 5 DESIGN criteria
- **Fields:** `## Goal` + `## Findings` (Findings is placeholder `_(Populated post-spike…)_`); parent edge to l9i.
- **Proposed:** `labels: [spike]`, `status: In Progress`, body verbatim. **CLEAN.**

### Sample epics

#### `vp-beads-0e9` (open)
- **Title:** Epic: Adopt beads v1.0+ capabilities in vp-beads
- **Fields:** `## Success Criteria` in description; 15+ child issues via `parent-child` dep edges.
- **Proposed Backlog.md task:**
  ```yaml
  id: BACK-0e9
  title: "Epic: Adopt beads v1.0+ capabilities in vp-beads"
  status: In Progress
  labels: [epic]
  # NOTE: this task has no `dependencies` itself; children point AT it.
  ```
  Body = description verbatim (`## Success Criteria` survives as heading).
- **Classification:** **LOSSY-BUT-RECOVERABLE.** Backlog.md has **no `epic` category** — confirmed in BM note `brew/brew-backlog-md`: "Item taxonomy: `task`, `doc`, `decision`, `milestone`. NO distinct `epic` / `bug` / `feature` / `chore` / `spike` / `story` types — categorization via labels only." Epic becomes `task + label:epic + inverse parent-child via children's dependencies`. The plan's earlier "epic → epic" assumption is wrong; the corrected design (`task + label:epic`) is necessary.

#### `vp-beads-l9i` (open, new MIG epic)
- **Title:** Tracker migration off bd
- **Fields:** `## Success Criteria` in description; 2 children (l9i.1, l9i.2).
- **Proposed:** identical pattern to 0e9. **LOSSY-BUT-RECOVERABLE.**

---

## Section 3 — Lossy field analysis

### `acceptance_criteria` standalone field

**bd:** structured frontmatter field, validator-enforced on create for `task`/`feature`/`bug`/`story`. AC for these types lives EXCLUSIVELY in this field for 36/37 affected issues.

**Backlog.md:** `--ac` CLI flag appends checklist items to a `## Acceptance Criteria` section inside the markdown body (per BM `brew/brew-backlog-md`: "Body sections: Description, Acceptance Criteria, Implementation Plan, Implementation Notes").

**Migration:** **REQUIRES SYNTHESIS.** Script must read the standalone `acceptance_criteria` field and append a `## Acceptance Criteria\n<bullets>` section to the markdown body. **If skipped, ~37% of issues (37/102) silently lose their AC.** Round-trip-test gate: every issue with non-empty AC field must produce a body containing `## Acceptance Criteria` post-migration.

bd's bullet format is already markdown (`-` prefix) so transformation is concatenation, not re-formatting. Backlog.md's `--ac` produces checklist items (`- [ ]`); pre-existing bd bullets are not checkboxes, but plain markdown bullets in a `## Acceptance Criteria` section are still semantically Backlog.md-valid (Backlog.md reads the section, not just `- [ ]` lines).

### `## Steps to Reproduce` (bug)

Always lives in `description` for the 6/14 bugs that have it. Survives verbatim. **No loss.** (The 8 missing-section bugs are a pre-existing corpus issue; migration script should not silently fabricate the section.)

### `## Goal` + `## Findings` (spike)

6/6 spikes have both sections in `description`. Survive verbatim. **No loss.**

### `## Success Criteria` (epic)

2/2 epics have it in `description`. Survives verbatim. **No loss** — though the epic→task collapse means "Success Criteria" semantics no longer reserved-by-type (any labelled-epic task could in theory carry a `## Acceptance Criteria` instead). Convention only.

### `## Decision` + `## Rationale` + `## Alternatives Considered` (decision)

4/4 decisions have all 3 sections in `description`. Backlog.md has a dedicated `decision` category (one of the 4) AND stores in `backlog/decisions/`. So decisions migrate to a SEPARATE folder, not to `backlog/tasks/`. **No loss**, but migration script must route decision-typed bd issues to `decisions/` not `tasks/`.

### `## Acceptance Criteria` (task / feature / story)

For the 36 issues with AC field but no in-description heading: see §3 first paragraph. For the issues with in-description heading: survives verbatim.

### Dependency-edge type information

**bd:** dependencies are typed (`parent-child`, `blocks`, `related`, `discovered-from`, …). Example `vp-beads-l9i.2` has both a `parent-child` edge to `l9i` and a `blocks` edge to `l9i.1`.

**Backlog.md:** `dependencies` frontmatter field is a flat array of IDs — no type. **All edge-type distinctions are LOST.** This is a real semantic loss: knowing "X blocks Y" vs "X is parent of Y" matters for sprint planning. swarm-wave's `bd dep tree` and backlog-groomer's "blocked chains" queries become impossible without auxiliary metadata.

**Mitigation options:**
1. Encode edge type in label on the dependent (e.g. `BACK-l9i.2` carries `labels: [parent-of-l9i, blocked-by-l9i.1]`) — ugly, doesn't scale.
2. Add a `## Dependencies` section to the body listing typed edges in human-readable form, separate from frontmatter array — duplicated info.
3. Accept the loss for `parent-child` (covered by labels: `epic` child relation is implicit from naming convention `0e9.1`, `0e9.2`) and ONLY preserve `blocks` in frontmatter.
4. **Recommended:** option 3 + add `parent: <id>` as a custom frontmatter field (Backlog.md preserves unknown frontmatter — per BM note, frontmatter is open). Need to verify Backlog.md's MCP `task_edit` doesn't strip unknown fields.

### `notes` field

bd has a `notes` field (open-ended history). Corpus shows it populated on some issues. Backlog.md has `## Implementation Notes` section. Lossy mapping: `notes`-array entries should concatenate into the body section. **Not material for vp-beads** — sample inspection shows notes rarely used.

### `close_reason` + `close_at` + `defer_until`

`close_reason` is rich free text (sample: `"Wave 2 spike complete; …"`). Backlog.md `task_complete` records completion but doesn't carry close-reason as a structured field; would migrate into `## Implementation Notes` or be lost. `defer_until` (timer-based) has no Backlog.md equivalent — would migrate to `labels: [deferred-YYYY-MM-DD]` or be dropped. Neither is in heavy use in the corpus; check before assuming low-risk.

---

## Section 4 — Type-conflation risk audit

Grep across `skills/*/SKILL.md`, `agents/*.md`, `hooks/*.sh`, `scripts/` for `bd <cmd> -t <type>` and `--type=<type>` invocations:

```
skills/backlog-groomer/SKILL.md:225:   (`bd create -t epic`) as a group container, with child issues linked.
skills/backlog-groomer/SKILL.md:236:8. Run `bd create "title" -t <type> -p <priority> --description "..."` per
skills/retrospective/SKILL.md:264:bd create "..." -t bug|task|feature|chore -p N --description "..."
skills/retrospective/SKILL.md:290:   `bd create --type=decision` with structured templates plus
skills/retrospective/SKILL.md:292:2. **Or create directly via `bd create --type=decision`** with the four-section
skills/sibling-sync/SKILL.md:609:  `bd update --type=bug` after adding the required sections, or supersede
```

**Total: 6 type-flag invocations across 3 skills.** ALL are `bd create` or `bd update` (write-side, creation-time type assignment) — **ZERO are `bd list -t <type>` or `bd ready -t <type>` (query-side type filters).**

### Implication

Type is used only as a **write-time discriminator for creating issues with the right required-section validation**, never as a **read-time query filter**. Under Backlog.md:

| bd invocation | Backlog.md equivalent |
|---|---|
| `bd create -t epic …` | `backlog task create … --labels epic` |
| `bd create -t bug …` | `backlog task create … --labels bug` (then ensure body has `## Steps to Reproduce` + AC checklist via `--ac`) |
| `bd create -t feature …` | `backlog task create … --labels feature --ac "…"` |
| `bd create -t spike …` | `backlog task create … --labels spike` (then ensure body has `## Goal` + `## Findings`) |
| `bd create -t story …` | `backlog task create … --labels story --ac "…"` |
| `bd create -t chore …` | `backlog task create … --labels chore` |
| `bd create -t decision …` | `backlog decision create …` (separate command — different storage folder) |
| `bd create -t milestone …` | `backlog milestone add …` (Backlog.md has native `milestone` category) |
| `bd update --type=bug …` | `backlog task edit … --labels bug` (label management; no required-section enforcement) |

**Soft validation loss.** bd's `validation.on-create=error` HARD-rejects creation when required sections are missing. Backlog.md applies only soft enum validation on labels/statuses (per BM note: "Backlog.md has 4 categories + soft enum validation. Looser by intention"). After migration:

- Skills that file issues must **template the required sections themselves** (e.g. swarm-wave's bug-filing template must include `## Steps to Reproduce` literally — no longer a tool-enforced contract).
- Validate-plugin.mjs could add a convention check on `backlog/tasks/*.md` body sections per label (recover the lost enforcement at lint time).

**No queries break.** All 6 invocations are write-side; no `bd list -t` or `bd ready -t` exists in the codebase. Confirmed via grep — query-side type filtering is not used.

---

## Section 5 — Verdict

| Category | Types | Migration shape |
|---|---|---|
| **CLEAN** (migrate as-is with label appended) | `chore`, `story`, `spike`, `bug` (when sections present in desc) | `task + labels:[<type>]`, body verbatim |
| **REQUIRES-ADAPTATION** (script must synthesize AC section from standalone field) | `task`, `feature`, `bug` (when AC in standalone field) | `task + labels:[<type>]`, body = description + `## Acceptance Criteria\n<bullets-from-field>` |
| **LOSSY-BUT-RECOVERABLE** (no native category; use labels + convention) | `epic` | `task + labels:[epic]`; children encode parent via custom `parent:` frontmatter field |
| **ROUTING REQUIRED** (different storage folder) | `decision`, `milestone` | Decision → `backlog/decisions/`; milestone → `backlog milestone add` (vp-beads corpus has 0 milestones) |
| **BROKEN-MODEL** | *(none)* | — |

**Overall:** the 9→4 collapse is **viable** for this corpus, provided three things happen in Phase 2b:

1. Migration script handles the `acceptance_criteria` field→`## Acceptance Criteria` section synthesis (else 37/102 issues silently lose their AC).
2. Plan's correction #2 — that epic is `task + label:epic` (NOT a 4th type) — is empirically necessary because Backlog.md has no `epic` category. Confirmed.
3. Skills must self-template required sections when filing issues (no tool-side validation backstop). Recommend a validate-plugin.mjs convention check on `backlog/tasks/*.md` to recover lint-time enforcement.

**Plan's design corrections are sound.** Re-reading the plan's "4 v1-design errors corrected" §2: "the 6 bd types (bug/feature/chore/story/spike/epic) become `task + labels:[<type>]`, with `epic` handled via parent-relationship" — this matches the empirical finding. The earlier (pre-correction) design that kept `epic` as a 4th type was wrong because Backlog.md has 4 categories `task / doc / decision / milestone`, not `task / decision / milestone / epic`.

**Caveats (small but real):**

- **Edge-type information loss** (parent-child vs blocks vs related) is the only un-mitigated semantic loss. Phase 2b should decide between (a) accepting the flat dependency model, (b) adding custom `parent:` frontmatter and trusting Backlog.md to preserve unknown fields, or (c) duplicating the typed graph in a separate sidecar file.
- **Dependency-typed graph queries** like swarm-wave's `bd dep tree`/`bd blocked` lose precision under flat deps; this is a Phase 2b skill-rewrite concern but worth surfacing here.

---

## Section 6 — Recommendations for Phase 2b

Three concrete must-do items for the migration script + skill rewrites:

1. **Migration script: synthesize `## Acceptance Criteria` from the standalone `acceptance_criteria` field.** Cover 37 issues at risk. Round-trip gate: pre-migration AC-field-non-empty count = post-migration `## Acceptance Criteria`-heading-present count. Cite this section's §3 first paragraph as the test rationale.

2. **Epic handling: `task + labels:[epic]` with inverse parent encoded as custom frontmatter `parent: <id>` OR via children's `dependencies:` array.** Validate first that Backlog.md's MCP `task_edit` preserves unknown frontmatter — if not, fall back to encoding the parent-child relationship in the body (`## Parent` section) or rely on naming convention (`0e9.1`, `0e9.2`) being the only signal. Decision is non-trivial; recommend a 30-min smoke test before locking in.

3. **Skills must self-template required sections per `labels:[<type>]`** since Backlog.md's validation is soft. Update: `backlog-groomer/SKILL.md:236` (issue-creation template), `retrospective/SKILL.md:264` and `:290-292` (decision/bug/task templates), `sibling-sync/SKILL.md:609` (bug-update guidance). Add a `scripts/validate-plugin.mjs` check that scans `backlog/tasks/*.md` and warns when the label-implied required sections are missing — recovers the lint-time enforcement bd's `validation.on-create=error` provided for free.

**Bonus (optional):** decide what to do with dependency-edge types. If Phase 2b accepts the flat-dep model, document the loss in `CHANGELOG.md` and update `backlog-groomer/SKILL.md:124` (`bd blocked` reference) + `swarm-wave/SKILL.md` dep-tree references. If Phase 2b preserves them, prototype the custom-frontmatter approach early — the migration script's complexity changes meaningfully.
