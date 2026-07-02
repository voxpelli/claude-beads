## Bugs

- **Sub-agent `permissions.allow` doesn't inherit from user-level `~/.claude/settings.json`** (2026-05-18) — Sub-agents launched via the Task tool only inherit project-level permissions (`.claude/settings.local.json` etc.), not user-level. Symptom: Bash patterns or `mcp__*` tool names pre-listed at user-scope are silently denied in sub-agent context, even though main-thread Bash succeeds (main-thread sees both scopes + has interactive UX to add rules on the fly; sub-agents have neither).

  **Initial misdiagnosis:** First framed as a sandbox issue (claim: `/tmp/` writes blocked, `dangerouslyDisableSandbox: true` doesn't override). Subsequent empirical validation (Agent B + Agent D + claude-code-guide research, 2026-05-18) refuted this: the OS sandbox is off by default (`/sandbox` is opt-in), `/tmp/` writes actually work in sub-agents, and `dangerouslyDisableSandbox` targets the wrong layer entirely. The real blocker is the `permissions.allow` inheritance bug.

  **Upstream tracking:** `anthropics/claude-code#18950` (primary, with full repro on Claude Code 2.1.12). Cluster: #25000, #27661, #34315. Related bug `anthropics/claude-code#51057` — `/fewer-permission-prompts` silently drops env-var-prefixed commands (`FOO=bar npm test`), so generated rule fails for sub-agents that need such patterns.

  **Second restriction layer (independent of #18950):** server-side transcript classifier mentioned in 2026 Anthropic engineering "auto mode" blog. Only gates auto-mode; not the primary cause of sub-agent denials we hit.

  Severity: degraded · Ownership: upstream · Workaround: full — see CLAUDE.md "Sub-agent permissions in Task-tool launches" section. Hybrid pattern: run `/fewer-permission-prompts` for baseline, then hand-curate `.claude/settings.local.json` for anticipated new operations. Investigation complete (workaround is full); the original spike card lives in `backlog/_archive/` (superseded Backlog.md dogfood).

## Feature Requests

_No entries yet._

## Upstream Opportunities

_No entries yet._
