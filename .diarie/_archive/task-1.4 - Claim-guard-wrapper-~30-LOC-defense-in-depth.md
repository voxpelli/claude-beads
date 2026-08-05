---
id: TASK-1.4
title: 'Claim-guard wrapper (~30 LOC, defense-in-depth)'
status: To Do
assignee: []
created_date: '2026-05-18 20:51'
labels:
  - phase-2b
  - security
  - swarm-wave
dependencies: []
parent_task_id: TASK-1
priority: medium
ordinal: 9000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Agent B (concurrency) finding: all FAIL cases share fingerprint 'last-write-wins, silent'. Single-owner-per-issue rule in swarm-wave workflow 1.4g prevents the contention in current usage, but a ~30 LOC claim-guard wrapper (read-after-write check, fail loudly on assignee mismatch) closes the entire class as defense-in-depth. Covers lost-update, multi-field race, stale-claim overwrite scenarios. Goes in swarm-wave skill claim step.
<!-- SECTION:DESCRIPTION:END -->
