---
id: TASK-1.7
title: >-
  Skill rework — text-rename pass (mechanical bd→backlog across 7 skills + 4
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
Mechanical rename of `bd <cmd>` invocations to `backlog <cmd>` or `mcp__backlog__<tool>` calls across all 7 skills (backlog-groomer, retrospective, upstream-tracker, vendor-sync, synergy-tracker, sibling-sync, swarm-wave) and 4 hooks (precompact.sh, session-start.sh, post-file-edit.sh, post-bm-failure-classify.sh). Wave-able — file-disjoint per skill/hook. Estimated ~100-150 LOC changes (no logic changes, just text).
<!-- SECTION:DESCRIPTION:END -->
