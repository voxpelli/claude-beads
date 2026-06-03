---
id: TASK-1
title: Phase 2b — Backlog.md migration (vp-beads → vp-heddle)
status: To Do
assignee: []
created_date: '2026-05-18 20:51'
updated_date: '2026-05-18 21:04'
labels:
  - epic
  - phase-2b
  - tracker-migration
dependencies: []
priority: high
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Parent task for all Phase 2b work migrating vp-beads from bd to Backlog.md. Verdict from Phase 2a spike (bd vp-beads-l9i.2): MIXED — adopt Backlog.md + layer vp-beads-side supplements. Synthesis: SPIKE-MIG.1.md at project root. ~680-860 LOC budget, ~4 sprints estimated. Tracking switched to Backlog.md for this branch as a dogfood experiment — bd holds spike history (vp-beads-l9i.* closed).
<!-- SECTION:DESCRIPTION:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
## Revised LOC budget (post substrate-not-opinion doctrine, 2026-05-18)

| Component | Original (from SPIKE-MIG.1.md) | Revised (substrate-not-opinion) | Rationale |
|---|---:|---:|---|
| Skill rework (3 substantive + 1 hook) | 410–485 | **200–300** | Skills wrap substrate primitives but supply their own workflow; no absorption of Backlog.md's plan-approve-execute-finalize loop or DoD/AC distinction |
| vp-heddle shim (ready/blocked/stale/stats/dedup) | ~150 | ~150 | Unchanged — primitive ops missing from Backlog.md surface |
| Claim-guard wrapper | ~30 | ~30 | Unchanged — defense-in-depth around last-write-wins fingerprint |
| Constitutional Guardrail PreToolUse hook | 60–75 | **70–90** | Slight bump: Agent E's response-side wrapping needs add ~10–15 LOC |
| Migration script | 80–120 | 80–120 | Unchanged — substrate concern |
| Sub-agent sandbox workarounds | — | 0–50 | New: TASK-1.9 investigation may produce small reusable workaround code |
| **Total** | **~680–860** | **~530–740** | ~25% smaller |

## Execution sequence (precondition → security → migration → adoption)

**Wave 1 (preconditions, sequential):**
1. TASK-1.1 — gh api verification pass (~30 min, closes evidence-quality caveats from Wave 1+2 sub-agent sandbox blocks; gates Guardrail design)
2. TASK-1.9 — sub-agent sandbox investigation (informs all future swarm-wave usage including the Constitutional Guardrail itself; can run parallel with 1.1 once main-thread)

**Wave 2 (security, ships first per spike recommendation):**
3. TASK-1.2 — Constitutional Guardrail PreToolUse hook (~75–90 LOC)
   - TASK-2.1 — onStatusChange Clinejection vector (HIGH net-new)
   - TASK-2.2 — Response-side wrapping
4. TASK-1.5 — Backlog.md integrity check (composable with Guardrail or standalone pre-commit hook)

**Wave 3 (migration, sequential after Wave 2):**
5. TASK-1.3 — Migration script scripts/migrate-from-bd.mjs
   - TASK-5.1 — id-map.json emitter + _Original ID:_ embedding (HIGH identity break)
   - TASK-5.2 — AC double-source detect-and-pick (HIGH 37/102 silent loss)

**Wave 4 (adoption, parallel-able where file-disjoint):**
6. TASK-1.6 — vp-heddle shim
7. TASK-1.7 — Skill rework: text-rename pass (wave-able)
8. TASK-1.4 — Claim-guard wrapper

**Wave 5 (substantive rework, sequential):**
9. TASK-1.8 — Skill rework: substantive (backlog-groomer + retrospective + swarm-wave)

## Cutover gates

- Wave 2 must complete before Wave 3 (migration script depends on Guardrail being in place for safe operation)
- Wave 3 must complete before Wave 4 (skill rework targets the migrated state)
- After Wave 5: cut v1.0.0 release (M2 milestone — substrate migration complete)
- Rename to vp-heddle (or vp-warp per Tier 2) at M4 (external user adoption signal), NOT at M2

## Why substrate-not-opinion changes the budget

Original estimate assumed skills would translate Backlog.md's workflow into vp-heddle's workflow — that's a 1:1 absorption. Under substrate-not-opinion (ROADMAP §6 "no workflow-prescribing tool"), skills wrap Backlog.md's CRUD primitives but supply vp-heddle's own workflow. The translation layer disappears; only the primitive-call substitution remains. Hence ~30% reduction in skill-rework LOC.

This is doc-level estimation. Per [[doc-alignment-vs-operational-alignment]] feedback memory, the real number lands after Wave 5 execution. Treat ~530–740 as a planning ceiling; recalibrate after each wave.

## Post-v0.17.0 reconciliation (2026-06-03)

This branch merged current `main` (v0.17.0). Two scope deltas:

- **Counts: 7 → 8 skills, 4 → 3 hooks.** v0.17.0 added the `harden-memories`
  skill and retired `precompact.sh` + `post-compact.sh` (folded into
  `session-start.sh`'s `source=compact` branch). TASK-1.7's mechanical rename
  pass is **7 bd-shell-out skills + 3 hooks**.
- **OPEN SCOPE QUESTION — `harden-memories` has no Backlog.md analog.** Its
  entire subject is the `bd remember` store (`bd memories` / `bd forget`),
  which Backlog.md does not provide. It does not fit the mechanical rename and
  is tied to the **Memory migration** step (DESIGN §Phase 2b): once
  `bd remember` entries move to MEMORY.md / CLAUDE.md and the `bd prime`
  injection is dropped, the skill loses its subject. Wave-5 re-plan must decide:
  **drop** it, or **repurpose** it to audit the new memory home. Do NOT assume
  it call-site-renames like the other 7.
<!-- SECTION:PLAN:END -->
