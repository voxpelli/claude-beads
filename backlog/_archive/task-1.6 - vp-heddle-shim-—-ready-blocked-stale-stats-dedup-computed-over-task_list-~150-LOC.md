---
id: TASK-1.6
title: >-
  vp-heddle shim — ready/blocked/stale/stats/dedup computed over task_list (~150
  LOC)
status: To Do
assignee: []
created_date: '2026-05-18 21:03'
labels:
  - phase-2b
  - shim
dependencies: []
parent_task_id: TASK-1
priority: high
ordinal: 11000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Backlog.md's MCP surface doesn't include the bd-equivalents of `bd ready`, `bd blocked`, `bd stale`, `bd stats`, `bd find-duplicates`. vp-heddle implements these as a thin shim computed over `mcp__backlog__task_list` responses. ~150 LOC per Agent A's analysis. Substrate-not-opinion: this is vp-heddle code reading substrate state, not substrate-imposed workflow.
<!-- SECTION:DESCRIPTION:END -->
