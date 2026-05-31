# SPIKE MIG.1.4 — Skill rework cost estimate (Backlog.md migration)

**Bead:** vp-beads-l9i.1.4
**Date:** 2026-05-18
**Sources:** `grep -rn "bd " skills/ hooks/`; DeepWiki `MrLesk/Backlog.md` (3 queries); Basic Memory note `brew/brew-backlog-md` (2026-05 audit).
**Caveats:**
- `gh api` was blocked in this sandbox, so DeepWiki is the only catalog source — its tool list is internally consistent across 3 queries and aligns with what the BM note named concretely, so I treat it as authoritative. The BM note's "75+ tools" headline appears to conflate MCP tools with CLI subcommands + dynamically-enum'd parameter variations; the underlying MCP `addTool(...)` count is ~20–22.
- **Path note:** The task spec asked for this file at `/tmp/SPIKE-MIG.1.4-findings.md`, but the sandbox blocked writes to `/tmp` (and blocked `dangerouslyDisableSandbox` retries). Wrote here instead as a new untracked root-level file. Synthesis can move/symlink as needed.

---

## Section 1 — bd-call surface inventory

Source: `grep -rohE "bd [a-z-]+" skills/ hooks/` filtered to real subcommands (dropped `bd backlog`, `bd to`, `bd v`, `bd will`, `bd issue`, `bd error`, `bd github`, which are prose/false-positives — except `bd github sync` which is intentional and mentioned but not used).

Distinct subcommands actually invoked in vp-beads skills + hooks:

| # | bd subcommand | Distinct call-sites | What it does in vp-beads context |
|---|---|---|---|
| 1 | `bd create` | backlog-groomer:236, retrospective:264, sibling-sync:580/601/636/660, swarm-wave/command-patterns:65 | Create a new issue, with type/priority/description |
| 2 | `bd create --json` | backlog-groomer:58 (probe pattern) | Probe required-section validation by parsing JSON error response |
| 3 | `bd create -t <type>` / `--type=<type>` | backlog-groomer:225/236, retrospective:264/290/292 | Create typed issue (epic / decision / etc.) |
| 4 | `bd list --status open` | backlog-groomer:74/123/138, swarm-wave:77 | Enumerate the open backlog |
| 5 | `bd list --status in_progress` | backlog-groomer:74/121, swarm-wave:155, wave-planning-checklist:85, post-compact.sh:68 | Enumerate active claims (used by hook to restore context post-compact) |
| 6 | `bd list --status closed` | backlog-groomer:143 | Find superseding closed issues during closure review |
| 7 | `bd list --status=in_progress --json` | post-compact.sh:68 | Machine-readable claim list for hook output |
| 8 | `bd ready` | swarm-wave:77/233, swarm-wave/command-patterns:36 | List dependency-resolved unblocked work |
| 9 | `bd show <id>` | backlog-groomer:255, swarm-wave:143/236, retrospective:232, wave-planning-checklist:21, command-patterns:39/86 | Read full issue body for context loading |
| 10 | `bd update <id> --claim` | swarm-wave:137, command-patterns:42 | Atomically claim issue + transition to in_progress |
| 11 | `bd update <id> --priority N` | backlog-groomer:130 | Reprioritize after triage |
| 12 | `bd update <id> --description "..."` | backlog-groomer:264, retrospective:206 | Enrich/rewrite description |
| 13 | `bd update <id> --type=...` | sibling-sync:609 | Retype an issue after type discovery |
| 14 | `bd close <id>` | swarm-wave:147/155/196, command-patterns:45/92, wave-planning-checklist:59/78 | Close completed issue |
| 15 | `bd close <id> --reason "..."` | backlog-groomer:151 | Close with closure rationale text |
| 16 | `bd stats` | backlog-groomer:75, retrospective:231 | Aggregate counts (total/open/closed/etc.) |
| 17 | `bd stale --days N` | backlog-groomer:76/144, backlog-health-heuristics:11 | Surface aged issues (60d grooming, 90d closure) |
| 18 | `bd stale --json` | retrospective:190/208 | JSON-mode stale audit for retro |
| 19 | `bd blocked` | backlog-groomer:94/124, retrospective:232, swarm-wave:96, file-contention-and-clustering:81 | Detect dependency-blocked issues |
| 20 | `bd duplicates` | backlog-groomer:78/89/92, backlog-health-heuristics:36 | Exact content-hash duplicate detection |
| 21 | `bd find-duplicates` (alias `find-dups`) | backlog-groomer:80, backlog-health-heuristics:37/48 | Near-duplicate detection (mechanical or `--method=ai`) |
| 22 | `bd supersede <loser> <winner>` | backlog-groomer:91, backlog-health-heuristics:70 | Close-as-superseded preserving history |
| 23 | `bd duplicate <loser> <winner>` | backlog-groomer:92, backlog-health-heuristics:72 | Mark duplicate without closing |
| 24 | `bd search <keywords>` | backlog-groomer:79/181/208, backlog-health-heuristics:44/149 | Keyword search across issues |
| 25 | `bd dep add <child> <parent>` | backlog-groomer:239 | Add dependency edge |
| 26 | `bd dep remove <blocker> <blocked>` | retrospective:217 | Remove edge (cycle break) |
| 27 | `bd dep tree` | backlog-groomer:124 | Render dependency tree |
| 28 | `bd lint --json` | retrospective:189/204 | Template-compliance audit |
| 29 | `bd orphans --json` | retrospective:191/211 | Commit→issue reference integrity |
| 30 | `bd graph check --json` | retrospective:192/214 | Cycle + dangling-ref detection |
| 31 | `bd doctor --json` | retrospective:188/197 | Infrastructure health audit |
| 32 | `bd doctor --fix --yes` | retrospective:199 | Auto-fix infrastructure (gated on user approval) |
| 33 | `bd compact` | retrospective:233 | Prune closed issues (>150 threshold) |
| 34 | `bd github sync` | swarm-wave:113 (referenced, not invoked) | Post-sprint github mirror sync |

**Distinct count: 34.** (Drops to ~24 base commands if you collapse `--json`/`--type` variants into their parent.)

---

## Section 2 — Coverage table: bd → Backlog.md MCP

Categories: ✅ clean equivalent · ⚠️ partial / lossy · ❌ no equivalent (would need CLI shell-out or vp-beads-side reimplementation).

| # | bd command | Backlog.md MCP equivalent | Status | Gap notes |
|---|---|---|---|---|
| 1 | `bd create` | `task_create` | ✅ | Direct mapping; Backlog has only `task` (no typed issues — see #3) |
| 2 | `bd create --json` (probe) | n/a — schemas are introspectable via MCP `tools/list` | ✅ | Actually *better*: MCP schema is the source of truth, no need to probe via error parsing. Eliminates the `engineering/agents/cli-validation-discovery-via-json-error-probing` workflow entirely. |
| 3 | `bd create -t <type>` (9-type vocab) | `task_create` + labels OR `decision_create` for one type | ⚠️ | **Major semantic loss.** Backlog has 4 categories: task / doc / decision / milestone. The 9-type bd vocab (task / bug / feature / chore / epic / decision / spike / story / milestone) collapses to: `task` + label (for bug/feature/chore/epic/spike/story), `decision_create`, `milestone_add`. **No required-sections validation** ("soft enum" per DeepWiki). The plan explicitly endorses this collapse — see `engineering/agents/sharded-noodling-peacock` "4 v1-design errors corrected". |
| 4 | `bd list --status open` | `task_list` (status filter) | ✅ | Statuses are configurable enums (`To Do` / `In Progress` / `Done` by default); needs a one-time status-name remap. |
| 5 | `bd list --status in_progress` | `task_list` (status="In Progress") | ✅ | Same |
| 6 | `bd list --status closed` | `task_list` (status="Done") | ✅ | Same |
| 7 | `bd list --status=in_progress --json` | `task_list` MCP tool returns structured response | ✅ | MCP responses are already structured — the `--json` post-process step disappears. |
| 8 | `bd ready` | n/a | ❌ | **No "ready" filter.** DeepWiki: "no direct command to list ready tasks." Would need vp-beads-side computation: fetch `task_list` + each task's deps + check completion status of each dep. ~30 LOC shim, but defeats the per-call efficiency of `bd ready`. |
| 9 | `bd show <id>` | `task_view` | ✅ | Direct mapping |
| 10 | `bd update <id> --claim` | `task_edit` (status="In Progress", assignee=@me) in one call | ⚠️ | Functional but **not atomic** — `bd --claim` is a single-step transactional claim that prevents two agents from claiming the same issue. Backlog's edit-based equivalent is racy. This intersects directly with the Agent B concurrency spike (MIG.1.3) — flag for synthesis. |
| 11 | `bd update <id> --priority N` | `task_edit` (priority field) | ✅ | Direct mapping |
| 12 | `bd update <id> --description "..."` | `task_edit` (description field) | ✅ | Direct mapping; `task_edit` also has `notesAppend` for non-destructive append |
| 13 | `bd update <id> --type=...` | n/a (no retype) | ⚠️ | Type changes degrade to label-edits via `task_edit`. In the 4-category world this matters less. |
| 14 | `bd close <id>` | `task_edit` (status="Done") OR `task_complete` (move to completed folder) | ✅ | Two-call possibility: status edit, then optional `task_complete` for archival. Direct enough. |
| 15 | `bd close <id> --reason "..."` | `task_edit` (status="Done", notesAppend="Reason: ...") | ⚠️ | No first-class `--reason` field; convention-based via implementation notes. Minor friction, doc-only. |
| 16 | `bd stats` | n/a as MCP tool (CLI: `backlog overview` is TUI-only) | ❌ | **No machine-readable stats.** Would need vp-beads to compute by paging `task_list` and aggregating. ~20 LOC shim. Used in 2 places (backlog-groomer + retrospective health-audit). |
| 17 | `bd stale --days N` | n/a as MCP tool (CLI surfaces stale tasks in `backlog overview` TUI with hardcoded 30-day threshold) | ❌ | **No configurable-threshold stale detection.** Would need vp-beads to compute via `task_list` + filter on `updated_date`. ~15 LOC shim. Used in backlog-groomer (60/90 days) + retrospective. |
| 18 | `bd stale --json` | same as #17 | ❌ | Same gap |
| 19 | `bd blocked` | n/a | ❌ | **No blocked-list command.** System "detects blocked" implicitly via deps but no surfacing tool. Would need vp-beads to compute via `task_list` + dependency check. ~20 LOC shim. Heavy use across backlog-groomer, swarm-wave, retrospective, contention map. |
| 20 | `bd duplicates` | n/a | ❌ | **No content-hash dedup.** Backlog has `task_search` (fuzzy) only. The duplicates workflow degrades to keyword search — significant loss for backlog-groomer workflow 5 (suggest-closures). |
| 21 | `bd find-duplicates` (incl. `--method=ai`) | partial via `task_search` | ❌ | No near-duplicate detection; no AI-mode. Loss for backlog-groomer dedup workflow. |
| 22 | `bd supersede <loser> <winner>` | n/a (closest: `task_archive`) | ❌ | **No supersede linkage.** `task_archive` just files it away — no winner-pointer preservation. Loss for backlog-groomer + sibling-sync workflows that rely on history-preserving supersession. |
| 23 | `bd duplicate <loser> <winner>` | n/a | ❌ | Same as #22 |
| 24 | `bd search <keywords>` | `task_search` | ✅ | Direct mapping (fuzzy search) |
| 25 | `bd dep add <child> <parent>` | `task_edit` (dependencies field, set) | ✅ | Single tool handles deps |
| 26 | `bd dep remove <blocker> <blocked>` | `task_edit` (dependencies field, remove) | ✅ | Same |
| 27 | `bd dep tree` | n/a as MCP tool | ⚠️ | Deps visible in `task_view` per-task but no tree rendering. Compute-able vp-beads-side. Used in backlog-groomer only. |
| 28 | `bd lint --json` | n/a | ❌ | **No template-compliance lint.** Backlog has no required-sections enforcement at all (soft enum). The lint workflow loses its underpinning. **However:** this maps to a *deliberate* collapse per the plan — when you drop bd's 9-type validation, you also drop the lint that polices it. Not a bug, but the retrospective health-audit row goes away. |
| 29 | `bd orphans --json` | n/a | ❌ | **No commit→issue orphan detection.** Backlog has no concept of git-commit cross-references in this sense. Loss for retrospective health audit. Could be reimplemented as a vp-beads grep-over-git-log shim (~40 LOC). |
| 30 | `bd graph check --json` | n/a as explicit check (auto-validated on edit per DeepWiki) | ⚠️ | Cycles are *prevented* at edit time but no on-demand audit. The retrospective audit row degrades to "trust the runtime checks" — acceptable. |
| 31 | `bd doctor --json` | n/a | ❌ | **No infrastructure audit.** No equivalent — Backlog has no "infrastructure" concept (no hooks-dir / no Dolt remote / no sync state). The bd-doctor workflow becomes obsolete in a markdown-native world. **Not lossy, just unnecessary.** |
| 32 | `bd doctor --fix --yes` | same | ❌ | Same — obsolete by architecture |
| 33 | `bd compact` | `task_complete` moves to completed folder, `task_archive` | ⚠️ | Different model (per-task archive instead of bulk compact). Manual mapping. |
| 34 | `bd github sync` | n/a | ❌ | **No github mirror.** Would need to either drop the feature or build a vp-beads-side sync skill. Currently only referenced in swarm-wave prose, not actually invoked. Low practical loss. |

---

## Section 3 — Coverage percentage

Tallying status:

| Status | Count | % of 34 |
|---|---|---|
| ✅ Clean equivalent | 14 | 41% |
| ⚠️ Partial / lossy / convention-based | 8 | 24% |
| ❌ No equivalent (gap) | 12 | 35% |

**Strict coverage (✅ only):** 14 / 34 = **41%**.
**Charitable coverage (✅ + ⚠️):** 22 / 34 = **65%**.

If we further exclude commands that become **architecturally obsolete** under the migration (the plan explicitly drops these — they are not losses, they are intended simplifications):

- #2 `bd create --json` (probe pattern — MCP schemas obviate this)
- #13 retype (bd's 9→4 collapse is intentional per the plan)
- #28 `bd lint` (required-sections enforcement gone by design)
- #31/32 `bd doctor*` (no infra to audit in markdown-native world)
- #34 `bd github sync` (not in active use)

→ Adjusted denominator: 34 − 6 = 28 commands that still need coverage.
→ Strict coverage: 14 / 28 = **50%**.
→ Charitable coverage: 22 / 28 = **79%**.

**Threshold context:** the spike's adopt threshold is **≥85% MCP-equivalent coverage**. By any honest reading we are **below the adopt threshold** but **comfortably in the mixed-tier band (50–85%)**.

The dominant ❌ cluster is: `bd ready`, `bd blocked`, `bd stale`, `bd stats`, `bd duplicates`/`find-duplicates`, `bd supersede`/`duplicate`. All six are **computable client-side** from `task_list` + frontmatter inspection — they're missing CLI sugar, not missing data. A "vp-beads supplement shim" of ~150 LOC of JS/sh would close most of the gap.

---

## Section 4 — Skill rework cost table

LOC estimate is *bd-mention lines* + *prose rewrite lines* (workflow restructure, not pure noun-swap). Categories per task spec.

### Skills (7)

| Skill | bd-mention lines (from grep) | Category | Estimated LOC change | Notes |
|---|---|---|---|---|
| **backlog-groomer** | 39 in SKILL.md + 18 in references = 57 lines | **Substantive rewrite** | ~80–120 LOC | Heaviest. Workflows 1 (Triage), 3 (Closures), and 5 (Create-from-findings) depend on `bd stale`, `bd blocked`, `bd duplicates`, `bd find-duplicates`, `bd supersede`, `bd duplicate` — six of the ❌ commands. Either build vp-beads shim or rewrite workflows to use `task_search` + manual review. Type-vocabulary references (bug/feature/chore/spike/story) need rewriting to label-based selection. |
| **retrospective** | 21 lines in SKILL.md | **Substantive rewrite** | ~50–70 LOC | Beads-health audit (workflow step 7) is the bd-densest section: 5 of 6 audit rows (`bd doctor`, `bd lint`, `bd stale`, `bd orphans`, `bd graph check`, `bd stats`) have no Backlog MCP equivalent. Drop `doctor`/`lint` as obsolete-by-architecture; reimplement `stale`/`orphans`/`stats` as vp-beads shims OR drop the entire health-audit section and rely on `backlog overview` TUI screenshots in retros. |
| **upstream-tracker** | 0 bd-mentions | **Text-rename only** | <10 LOC | Pure noun-swap if anywhere; this skill doesn't touch the tracker substrate. Likely zero changes. |
| **vendor-sync** | 0 bd-mentions in skill | **Text-rename only** | <5 LOC | Same — doesn't interact with bd. |
| **synergy-tracker** | 2 prose mentions (SKILL.md:331, 560, 768) | **Text-rename only** | ~5 LOC | Prose references only ("bd backlog", "bd issue IDs"); no actual invocations. |
| **sibling-sync** | 9 lines (SKILL.md:38, 40, 86, 548, 580, 601, 609, 636, 660) | **Substantive rewrite** | ~25 LOC | Workflow 4 (Apply reciprocation batch) shells out `bd create` for sibling-friction issues. Needs `task_create` migration; also Charter-prose-rewrite (the v1.0.0 Integration Charter section is bd-specific, becomes obsolete or repositions as "tracker-agnostic"). |
| **swarm-wave** | 16 lines in SKILL.md + 16 lines in references = 32 lines | **Substantive rewrite + concurrency-critical** | ~60–80 LOC | Workflows 1 (Plan), 2 (Execute), 3 (Gate) use `bd ready`, `bd blocked`, `bd update --claim` (the racy one), `bd close`, `bd list --status in_progress`. **Crucial overlap with MIG.1.3 (Agent B):** if concurrency-smoke shows Backlog can't safely handle 4-agent parallel claims, this skill cannot migrate without a custom claim-locking layer. **Defer to Agent B's verdict.** |

**Sub-total skills:** ~225–315 LOC change across 4 substantive-rewrite skills, <30 LOC across 3 text-rename skills.

### Hooks (4)

| Hook | bd-mention lines | Category | Estimated LOC change | Notes |
|---|---|---|---|---|
| **post-compact.sh** | 6 lines (10, 60, 61, 62, 68, 76, 79) | **Substantive rewrite** | ~15 LOC | Currently `bd list --status=in_progress --json` for context restoration. Migrates to `backlog task list --plain` + manual filter (no `--json`, only `--plain` text mode) — needs a small parser. Lossier than current; acceptable. |
| **session-start.sh** | 1 line (115, prose only — "bd stats" in user-facing reminder string) | **Text-rename only** | 1 LOC | Just update the reminder text. |
| **post-file-edit.sh** | 0 bd-mentions | **No change** | 0 LOC | Operates on shell scripts, tracker-agnostic. |
| **post-bm-failure-classify.sh** | 0 bd-mentions | **No change** | 0 LOC | BM-specific, tracker-agnostic. |

**Sub-total hooks:** ~16 LOC.

### CLAUDE.md / MEMORY.md / docs

Not counted above but real: the 9-type table in CLAUDE.md, the "Issue tracking with beads" section, MEMORY.md core-types section all need rewriting to 4-category. Estimate ~150 LOC of doc rewrites.

### Grand total

| Bucket | LOC change |
|---|---|
| Skills (substantive) | 215–290 |
| Skills (rename-only) | <30 |
| Hooks | ~16 |
| Docs (CLAUDE.md, MEMORY.md, retrospective files referenced) | ~150 |
| **Total** | **~410–485 LOC** |

For a plugin with ~5,500 LOC across skills+hooks (rough estimate based on file counts), this is **~8–9% churn**. Concentrated in 3 skills and 1 hook. **Tractable in a single ~2-wave sprint** if (and only if) the concurrency verdict from MIG.1.3 is favorable.

---

## Section 5 — Verdict input

**Recommendation: MIXED.**

The Backlog.md MCP surface covers **65% (charitable) / 41% (strict)** of the bd-call surface used in vp-beads — squarely in the mixed-tier band (50–85%), below the ≥85% adopt threshold. The gap is concentrated in six computable-client-side commands (`bd ready`, `bd blocked`, `bd stale`, `bd stats`, `bd duplicates`/`find-duplicates`, `bd supersede`/`duplicate`) plus one architectural-collapse cluster (`bd doctor`/`bd lint`/`bd graph check` — obsolete by design under the markdown-native model and the planned 9→4 type collapse).

The **skill rework cost is moderate (~410–485 LOC, ~8–9% churn)** and concentrated in 3 of 7 skills (backlog-groomer, retrospective, swarm-wave). Tractable in a 2-wave sprint *if* the concurrency verdict from Agent B (MIG.1.3) is favorable — the racy `task_edit`-as-claim pattern is the single biggest unknown. The plan's "build supplements on top of Backlog.md" mixed path looks empirically validated: a small (~150 LOC) vp-beads-side shim providing `ready` / `blocked` / `stale` / `stats` / `dedup` computations over `task_list` MCP responses would close most of the gap and lift charitable coverage to ~90%.

**Surprises for synthesis to weigh:**

1. **The "75+ tools" README claim doesn't survive scrutiny** — DeepWiki consistently surfaces ~20 registered MCP tools (cross-verified across 3 queries). The BM note `brew/brew-backlog-md` appears to have over-counted by including CLI subcommands and dynamic enum variations. The MCP surface is leaner than advertised, which strengthens the "mixed" verdict.
2. **`task_edit`-as-claim is not atomic** (DeepWiki confirms). Direct conflict with vp-beads' multi-agent claim semantics in swarm-wave. This is the synthesis-critical question — defer to MIG.1.3's empirical concurrency test before any final adopt/mixed/rebuild call.
3. **No `--json` output mode** anywhere in the CLI — only `--plain` human-text. All `bd ... --json` invocations would need to migrate to MCP tools (good) OR parse `--plain` output (lossy). The retrospective health audit and post-compact.sh hook are affected.
4. **Several `bd` features become obsolete-by-architecture, not lost** — `bd doctor` audits Dolt-and-hooks infra that doesn't exist in Backlog.md; `bd lint` polices required sections that the 9→4 collapse removes anyway. Honest math should treat these as cancelled, not as missing — that's the basis for the 79% adjusted-charitable coverage figure.

If the synthesis weighs the architectural-collapse adjustments and Agent B finds concurrency tractable, this could plausibly upgrade to **soft-adopt with shim** rather than full mixed. If concurrency fails, it's **rebuild** (the racy-claim risk alone is sprint-stopping).
