---
id: TASK-2.1
title: Block onStatusChange Clinejection vector (HIGH net-new)
status: To Do
assignee: []
created_date: '2026-05-18 20:51'
labels:
  - phase-2b
  - security
  - guardrail
  - clinejection
dependencies: []
parent_task_id: TASK-1.2
priority: high
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Backlog.md ships per-task and global YAML-frontmatter-configured shell commands that fire on status change, templated with $TASK_TITLE etc., executed via bun.spawn(sh -c ...). Upstream acknowledges risk in task-321 implementation notes. Guardrail must EITHER block task_edit --status when any onStatusChange is configured anywhere in the repo or globally, OR validate that no agent-controllable string interpolates into onStatusChange templates. Textbook Clinejection vector — must address explicitly.
<!-- SECTION:DESCRIPTION:END -->
