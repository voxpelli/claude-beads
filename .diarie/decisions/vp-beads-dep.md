---
id: vp-beads-dep
title: Retire the sprint-review agent and the backlog-groomer skill
status: pending
type: decision
priority: medium
updated: '2026-07-15'
---

## Decision

**Retire two components — the `sprint-review` agent and the `backlog-groomer` skill.** They have
not earned their place, and they were the load-bearing members of a "sprint loop" narrative that the
usage evidence does not support. Execute at the repackaging (see `## Affects`), not piecemeal now.

## Rationale

Decided from **usage evidence + operator testimony**, not structure — and applying burden-of-proof:
for an agent or a gate, the question is *"what evidence of the intended outcome?"*, and here there is
almost none.

- **`sprint-review` (agent): never used.** The user has never seen its proactive end-of-sprint gate
  fire. It is the plugin's only agent, and a gate whose intended outcome has never been observed does
  not meet the burden to keep it.
- **`backlog-groomer`: barely used.** The user triages the `.diarie/` backlog by editing the YAML
  directly — which is the substrate-not-opinion way the tracker was built for. A 6-workflow triage
  skill is over-built against how the backlog is actually worked.

Corroborating artifact evidence (2026-07-15): the *used* skills leave heavy traces —
`upstream-tracker`/`synergy-tracker` have 5 `UPSTREAM-*.md` + 2 `SYNERGY-*.md` across 23 + 11 commits;
`retrospective` has 16 `RETRO-*.md` on disk; `swarm-wave` has 10 `SWARM-*.md`. The two retired
components leave no comparable trace.

**The knock-on that matters:** retiring `sprint-review` removes the only agent, which was the main
construct *forcing* a Claude-plugin packaging. With it gone, the only plugin-forcing constructs left
are the hooks — and those split across concerns (tracker → diarie, BM → vp-knowledge, shfmt → dev).
Retiring the two weak skills dissolves the fake coherence of "vp-beads" and lets the survivors return
to their real substrates.

## Alternatives Considered

- **Keep both, just group them.** Package as-is on the chance the unused parts get adopted later.
  Rejected: it preserves surface to maintain and name, and keeps propping up a loop nobody runs.
- **Thin / fold, don't delete.** Fold backlog-groomer's research/dedup into swarm-wave's research-wave
  and sprint-review's gate idea into retrospective's opening step. A reasonable salvage — held in
  reserve. Rejected as the default because it still spends effort re-homing capabilities with no
  demonstrated demand; revisit only if a concrete need for either core surfaces.

## Affects

Retirement is a doc-and-reference sweep, not a delete (global rule: doc-grep *before* the removal
plan, treat the grep as input). Known surfaces:

- **`swarm-wave` research-wave hands off to `/backlog-groomer`** (workflows 5/6) for issue creation.
  Removing groomer dangles that edge — research-wave must then write tasks directly or stop at
  "present findings". A real behavioral decision, not a doc edit.
- **`backlog-groomer` is the sole Tier-B component** in CLAUDE.md `### Files-availability convention`
  — retiring it empties that tier.
- **`sprint-review` is named** by `retrospective`, `swarm-wave` (SKILL.md:32), CLAUDE.md's component
  list + sprint-cycle diagram, and the `vp-claude` marketplace entry.
- Component counts ("9 skills, 1 agent") in CLAUDE.md, README, MEMORY.md.

**Execution trigger:** the vp-beads repackaging / diarie extraction. This decision records the intent
so nobody quietly deletes — or lovingly re-packages — either component in the meantime. It is part of
the larger "vp-beads decomposes into vp-sync + vp-swarm; retrospective + BM-hook → knowledge side;
tracker-hooks + adoption → diarie" repackaging still being scoped.
