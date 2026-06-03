---
id: TASK-1.7
title: >-
  Skill rework — text-rename pass (mechanical bd→backlog across 7 skills + 3
  hooks)
status: To Do
assignee: []
created_date: '2026-05-18 21:03'
labels:
  - phase-2b
  - skill-rework
  - mechanical
dependencies: []
parent_task_id: TASK-1
priority: medium
ordinal: 12000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Mechanical rename of `bd <cmd>` invocations to `backlog <cmd>` or `mcp__backlog__<tool>` calls across all 7 bd-shell-out skills (backlog-groomer, retrospective, upstream-tracker, vendor-sync, synergy-tracker, sibling-sync, swarm-wave) and 3 hooks (session-start.sh, post-file-edit.sh, post-bm-failure-classify.sh). Wave-able — file-disjoint per skill/hook. Estimated ~100-150 LOC changes (no logic changes, just text).

**Not in this pass:** the 8th skill, `harden-memories` (added vp-beads v0.17.0), audits the `bd remember` store and has **no Backlog.md analog** — it is dropped or repurposed by the Memory migration (see TASK-1 plan / DESIGN §Phase 2b), not call-site-renamed. Hook count updated post-v0.17.0: `precompact.sh` and `post-compact.sh` were retired (folded into `session-start.sh`'s `source=compact` branch), so this is **3 hooks, not 4**.
<!-- SECTION:DESCRIPTION:END -->
