---
id: TASK-1.3
title: Migration script scripts/migrate-from-bd.mjs (~100 LOC + 5 specific behaviors)
status: To Do
assignee: []
created_date: '2026-05-18 20:51'
labels:
  - phase-2b
  - migration
dependencies: []
parent_task_id: TASK-1
priority: high
ordinal: 6000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Node script migrating ~102 existing bd issues from .beads/issues.jsonl to Backlog.md's backlog/tasks/ format. Per Agent C's findings: ~88-92% lossless WITH the 5 specific behaviors below; ~65% without (silent data loss). Sub-tasks track each behavior. Round-trip 50-sample test before running on full corpus.
<!-- SECTION:DESCRIPTION:END -->
