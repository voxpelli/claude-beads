---
id: TASK-5.2
title: 'Migration: AC double-source detect-and-pick (HIGH — 37/102 silent loss)'
status: To Do
assignee: []
created_date: '2026-05-18 20:51'
labels:
  - phase-2b
  - migration
dependencies: []
parent_task_id: TASK-1.3
priority: high
ordinal: 8000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Agent C + Agent D finding: 36 bd issues store AC EXCLUSIVELY in bd's standalone acceptance_criteria frontmatter field (not in description body); 35 use a ## Acceptance Criteria markdown section in description; 1 uses both; 30 use neither. Migration must detect-and-pick or 37% of issues silently lose their AC. Test against the corpus before running.
<!-- SECTION:DESCRIPTION:END -->
