---
id: TASK-2.2
title: Response-side wrapping for task_view / task_list MCP responses
status: To Do
assignee: []
created_date: '2026-05-18 20:51'
labels:
  - phase-2b
  - security
  - guardrail
dependencies: []
parent_task_id: TASK-1.2
priority: medium
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Agent E finding: task_view / task_list return content verbatim with no provenance wrapping, no boundary markers. Stored prompt injections from prior writes reach agent context unmarked. Guardrail layers 2 (structural wrap) and 4 (markdown-mimicry strip) must apply to MCP responses, not just requests. Adds ~10-15 LOC to base Guardrail estimate.
<!-- SECTION:DESCRIPTION:END -->
