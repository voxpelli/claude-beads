---
id: TASK-5.1
title: >-
  Migration: id-map.json emitter + _Original ID:_ embedding (HIGH — identity
  break)
status: To Do
assignee: []
created_date: '2026-05-18 20:51'
labels:
  - phase-2b
  - migration
dependencies: []
parent_task_id: TASK-1.3
priority: high
ordinal: 7000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
All 102 IDs shift from vp-beads-{slug} to TASK-N. BM ## Upstream Friction lists, RETRO/SWARM markdown, git commit messages reference vp-beads IDs and can't auto-rewrite. Emit id-map.json at migration time + embed _Original ID:_ in every migrated task body so back-references stay greppable. Without this, every cross-reference in the knowledge graph becomes a dangling pointer.
<!-- SECTION:DESCRIPTION:END -->
