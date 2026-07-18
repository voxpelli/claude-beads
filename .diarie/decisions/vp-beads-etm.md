---
id: vp-beads-etm
title: Settle the 4-vs-9 task type model (blocks per-type field validation)
status: pending
type: decision
priority: medium
parent: vp-beads-dia
updated: '2026-07-02'
---

## Decision

The Option-C flat-YAML substrate adopts the **4-type model**: `task` (work), `doc` (reference), `decision` (record), `milestone` (marker). bd's other five types (`bug`/`feature`/`chore`/`story`/`spike`) are FRAMINGS of `task`, carried in a new optional `labels:` string list; `epic` is `task` + `parent:` nesting (or an `epic` label). The `type:` enum stays exclusive (exactly one per item); framings stay additive. Settled 2026-06-10; implemented in scripts/task-schema.mjs (commit 51e8a4b).

## Rationale

Two-agent external validation round (Readwise/Raindrop/Basic-Memory + HuggingFace-papers/DeepWiki/web), ~75% confidence, both lean 4:

- **Decisive**: the beads codebase itself has ZERO agent logic keyed on IssueType (DeepWiki) — type is human/validation metadata, never a behavioral switch; the strongest keep-9 argument has no implementation even at its source.
- Every working agent-native tracker is single-kind or typeless: ralph prd.json (userStory only), Anthropic feature_list.json, git-bug (labels only).
- GitHub's 2024-25 Issue Types ship 3 defaults (bug/task/feature); epic was solved by sub-issues (= our parent:). The motivating gap was org-scale cross-repo reporting consistency — irrelevant at solo single-repo scale. Jira type-sprawl is a named anti-pattern.
- Exclusivity (the one structural property that made GitHub abandon labels-only) SURVIVES the collapse — the 4-value enum is still exclusive; only the six framings lose it (non-problem solo).
- User's own BM notes already argued to 4: substrate-not-opinion decision (2026-05), folksonomy lineage, brew-backlog-md comparison.

## Alternatives Considered

- **Keep 9** (declined): six framings as first-class types is substrate opinion; the synthesis doc's "9-type vocab genuinely good (kept)" credit was to bd's taxonomy DOCUMENTATION quality, not a binding commitment (synthesis correction-annotated).
- **Hybrid 9-valid/4-core** (declined): a two-tier vocabulary recreates the exact ambiguity this decision exists to kill (a fresh Explore agent already misread code-vs-DESIGN as "resolved" once).

## Affects

- scripts/task-schema.mjs, validate-tasks.mjs, fixtures/tests (DONE, commit 51e8a4b)
- **2026-06 follow-up (post-panel review): scripts/ready-walker.mjs's `computeReady` was type-blind** — the only gate was `status === 'pending'`, so a pending `doc`/`decision`/`milestone` surfaced as workable, making `type` decorative rather than load-bearing. FIXED: `computeReady` now also requires `type === 'task'`. Fixtures + assertions added (test/fixtures/backlog/tasks/*.yml gained doc/decision/milestone entries; check-ready-walker.mjs gained 5 type-gate assertions). Also removed a phantom `steps_to_reproduce:` key the validator was silently swallowing (undeclared-field drift) — re-expressed as `labels: [bug]`.
- `doc` and `decision` are RESERVED, not yet exercised by real data (zero live instances; the schema has no body/description field for their own prose). Deliberately NOT building a content-home mechanism now — no consumer exists yet (substrate-not-opinion, YAGNI). Their text lives in ordinary repo markdown until first real use. Filed for the retarget wave to own.
- RAN — read-only shadow dogfood (SPIKE-etm-dogfood-findings.md): scripts/migrate-from-bd.mjs projected all 131 real bd issues (read-only bd export -> scratch YAML, never written to backlog/tasks/), dual-run against bd ready via the existing TASKS_ROOT seam. Result: exactly ONE clean, fully-explained ready-set divergence — vp-beads-etm itself (a decision, meant to stay open while in force) appears in bd ready but correctly does NOT appear in ready-walker post-fix. Bonus finding: bd itself is type-blind the same way ready-walker was before the fix — bd ready never excludes decision-type issues either, so on this axis ready-walker is now stricter than the substrate it replaces. One named approximation loss confirmed as expected (deferred status has no exact YAML analog, mapped to cancelled). Zero unmapped bd statuses/types across the real corpus. No failure-gate trigger; etm stands. Scope caveat (added 2026-07-02, post-review): this validated the framings-collapse (6 bd types -> task+label, 131 real issues, zero unmapped) and the decision-type gate differentially against live bd. doc/milestone remain zero-instance / fixture-tested-only in this dogfood -- NOT validated against real data.
- vp-beads-bj7 (migrate-from-bd): maps 9→4 — bug/feature/chore/story/spike → task + label; epic → task + parent/label
- vp-beads-e42 (skill-retarget): retargeted skills speak 4 types + labels
- FUTURE label-conditional ADVISORY warnings (never hard errors — per-type HARD errors stay DROPPED as validation.on-create=error reborn): caveat 1 — per-type required-sections is the 9-type model's one evidenced benefit (issue quality = agent context), port as label-conditional warnings; caveat 2 — spike's "closes with findings, not code" is a genuine kind-difference (Backlog.md community task-355 wants spike back), its semantics travel with labels: [spike]
