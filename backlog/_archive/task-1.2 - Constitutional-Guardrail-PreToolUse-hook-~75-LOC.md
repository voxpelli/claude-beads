---
id: TASK-1.2
title: Constitutional Guardrail PreToolUse hook (~75 LOC)
status: To Do
assignee: []
created_date: '2026-05-18 20:51'
labels:
  - phase-2b
  - security
  - guardrail
dependencies: []
parent_task_id: TASK-1
priority: high
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
PreToolUse hook implementing the 6-layer Constitutional Guardrail (provenance tier + structural wrap + injection-marker flag-don't-block + markdown-prompt-mimicry strip + 8KB length cap + lethal-trifecta interlock). Composes on top of Backlog.md's existing sanitization (JSON schema validation, length caps, sanitizeString, sanitizeFilename, no MCP path arguments — refutes pre-spike 'zero defenses' baseline). One length-cap conflict resolved by keeping 8KB and forcing agents to split long writes. Ships first since it's substrate-independent and addresses Clinejection threat regardless of timing. Estimated ~60-75 LOC total.
<!-- SECTION:DESCRIPTION:END -->
