---
id: TASK-2
title: >-
  Build transcript-indexing utility for vp-knowledge (cross-session tool-call
  analysis)
status: To Do
assignee: []
created_date: '2026-05-18 21:32'
updated_date: '2026-05-18 21:32'
labels:
  - future-enhancement
  - vp-knowledge-candidate
  - observability
  - tooling
dependencies: []
priority: low
ordinal: 15000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A continuously-updated metadata index of Claude Code session transcripts (`~/.claude/projects/**/*.jsonl`), eliminating sampling-bias tradeoffs for `/fewer-permission-prompts` and unlocking other cross-session analyses (usage evolution, stale-MCP detection, denial prioritization).

**Why filed here, not vp-knowledge:** the idea surfaced 2026-05-18 during a `/fewer-permission-prompts` invocation in vp-beads when scanning 5700 transcripts (1.85 GB) raised the "this should be indexed, not re-scanned every time" question. Filing here for traceability of WHERE the need surfaced; actual implementation belongs in vp-knowledge (sibling project). When ready, file the implementation work as a vp-knowledge bd issue (or, if vp-knowledge gets a Backlog.md migration too, transfer this task there).

**Design captured in:** Basic Memory note `engineering/patterns/transcript-indexing-for-claude-code-cross-session-analysis` — full pattern, storage trade-offs (append-only TSV vs SQLite), watcher options (launchd vs SessionStart hook vs cron), privacy boundaries, natural homes for implementation.

**Recommended shape (per BM note):** hybrid — shell utility for sync (`~/.local/bin/claude-transcript-index sync`), thin MCP server for query (using harvmcp template, exposing `mcp__transcript-index__*` tools). Sync via SessionStart hook (lazy-eager — no daemon required; fresh when queries happen).

**Privacy:** index TOOL-CALL METADATA only (tool name, command first-token, session ID, timestamp). NEVER content (Bash args, MCP inputs, prompt/response text).

(Note: filed as TASK-2 top-level, not TASK-1.10 child, because the original `--parent task-1` flag was mis-passed in the create call. Backlog.md doesn't support re-parenting via CLI — file edit would work but leaving as-is since this is a future-enhancement candidate not tightly coupled to TASK-1's Phase 2b migration scope.)
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 `claude-transcript-index sync` extracts new tool_use entries from all `~/.claude/projects/**/*.jsonl` files modified since last sync; appends to `~/.local/state/claude-transcript-index/tool-calls.tsv`
- [ ] #2 Sync is idempotent (re-running with no new data is a no-op)
- [ ] #3 Sync handles deleted JSONLs (prune their rows from the index)
- [ ] #4 MCP server exposes at minimum: `query_tool_calls`, `top_tools_by_session_count`, `tools_used_in_project`
- [ ] #5 `/fewer-permission-prompts` rewritten to query the index instead of re-scanning JSONLs (~50ms vs ~30-60 sec)
- [ ] #6 Sync hooked into Claude Code via vp-knowledge SessionStart hook (lazy-eager pattern)
- [ ] #7 Documentation: README, MCP tool docs, privacy boundary explanation
- [ ] #8 Tests: round-trip a sample JSONL through sync; verify queries return expected counts; verify no content leakage in index file
<!-- AC:END -->
