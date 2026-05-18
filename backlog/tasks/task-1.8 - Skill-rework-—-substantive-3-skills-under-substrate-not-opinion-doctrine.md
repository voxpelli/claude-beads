---
id: TASK-1.8
title: Skill rework — substantive (3 skills under substrate-not-opinion doctrine)
status: To Do
assignee: []
created_date: '2026-05-18 21:03'
labels:
  - phase-2b
  - skill-rework
  - substantive
dependencies: []
parent_task_id: TASK-1
priority: high
ordinal: 13000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Rework 3 skills where the logic genuinely shifts under the migration: backlog-groomer (drops bd-specific quirks like JSONL re-import, validation gates; adopts shim for ready/blocked/stale), retrospective (drops bd-history reading, adopts task_list-based history; keeps own workflow), swarm-wave (claim+release pattern composes with Backlog.md's last-write-wins via the claim-guard wrapper from TASK-1.4). Sequential, not wave-able. Estimated ~150-200 LOC under substrate-not-opinion (was ~260-335 LOC under absorb-substrate-workflow model — ~30% smaller because vp-heddle workflow stays, only primitives change underneath).
<!-- SECTION:DESCRIPTION:END -->
