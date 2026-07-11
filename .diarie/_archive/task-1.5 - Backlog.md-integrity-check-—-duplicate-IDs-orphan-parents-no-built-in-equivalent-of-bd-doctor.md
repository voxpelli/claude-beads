---
id: TASK-1.5
title: >-
  Backlog.md integrity check — duplicate IDs + orphan parents (no built-in
  equivalent of bd doctor)
status: To Do
assignee: []
created_date: '2026-05-18 20:53'
labels:
  - phase-2b
  - integrity
  - guardrail
dependencies: []
parent_task_id: TASK-1
priority: medium
ordinal: 10000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Backlog.md has no built-in lint/check/doctor command. Adversarial testing during the dogfood switch (2026-05-18) found silent-failure modes:

- Duplicate `id:` frontmatter values: `task list` silently drops one
- Non-existent `--parent <id>` accepted; produces orphan subtask IDs
- Malformed frontmatter not flagged
- Next-ID auto-assignment doesn't account for subtask namespace conflicts

Build either: (a) a small Node script `scripts/backlog-doctor.mjs` invoked from a pre-commit hook, OR (b) integrate the checks into the Constitutional Guardrail's PreToolUse hook (already touching the markdown files). 

Recommended checks:
1. Duplicate `id:` values across `backlog/tasks/`, `backlog/decisions/`, `backlog/milestones/`
2. `parent_task_id:` references that don't resolve to an existing file
3. `dependencies:` entries that don't resolve to existing files
4. Required frontmatter fields present (id, title, status)
5. Status value in `backlog/config.yml` allowed-statuses list

Cheap to implement (~50 LOC), high value as defense-in-depth. Same spirit as bd's `bd doctor` + `bd graph check`.
<!-- SECTION:DESCRIPTION:END -->
