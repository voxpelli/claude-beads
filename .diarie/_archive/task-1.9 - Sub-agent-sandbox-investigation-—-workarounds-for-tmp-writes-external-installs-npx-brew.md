---
id: TASK-1.9
title: >-
  Sub-agent sandbox investigation — workarounds for /tmp/ writes + external
  installs (npx, brew)
status: To Do
assignee: []
created_date: '2026-05-18 21:03'
labels:
  - phase-2b
  - claude-code
  - sandbox
dependencies: []
parent_task_id: TASK-1
priority: medium
ordinal: 14000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Both Wave 1 sub-agents (Agent A and Agent B) hit sub-agent sandbox restrictions that blocked /tmp/ writes (even with dangerouslyDisableSandbox: true), `gh api`, `npx backlog.md`, and `brew install backlog-md`. Main thread is unrestricted. This affects EVERY future swarm-wave run that needs sub-agents to interact with /tmp/, run external CLI installs, or call non-MCP APIs. Investigate: (a) does .claude/settings.local.json allowedBash patterns help? (b) is there a Claude Code env var or flag that opens sub-agent sandbox? (c) what's the canonical pattern for sub-agents needing to install/run external tools? (d) should swarm-wave skill default to writing scratch files to project-root rather than /tmp/? File findings as new task or as a Backlog.md doc. Also create UPSTREAM-claude-code.md entry for the bug-side of this.
<!-- SECTION:DESCRIPTION:END -->
