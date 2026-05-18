## Bugs

- **Sub-agent sandbox blocks `/tmp/` writes and external installs even with `dangerouslyDisableSandbox: true`** (2026-05-18) — Sub-agents launched via the Agent tool hit Bash sandbox restrictions that:
  - Reject writes to `/tmp/` and reads of `/tmp/`-resident files
  - Reject `npx <package>` and `brew install <pkg>` (any install side-effect)
  - Reject `gh api` calls in some contexts (cross-confirmed by 2 independent sub-agents in the same wave)
  - `dangerouslyDisableSandbox: true` was set on one agent's launch and did NOT override the restrictions
  
  Main-thread Bash has no such restrictions in the same project. The asymmetry is between sub-agent context and main-thread context, not a project-level config.
  
  Hit reproducibly during vp-beads SWARM-15 Wave 1: Agent A (read-only research) had to write findings to project root instead of `/tmp/`; Agent B (concurrency test harness needing scratch project + `npx backlog.md`) couldn't execute at all and was taken over by main thread. This blocks any swarm-wave usage pattern where sub-agents need to:
  - Stand up scratch projects in `/tmp/` for empirical tests
  - Install transient tooling via `npx`/`brew` for one-off needs
  - Call external APIs via `gh` CLI
  
  Severity: degraded · Ownership: upstream · Workaround: partial — agents can write to project root (must add to .gitignore per session) and use MCP tools instead of CLI installs; main-thread takeover works for genuinely sandbox-incompatible cases. Investigation tracked in Backlog.md TASK-1.9.

## Feature Requests

_No entries yet._

## Upstream Opportunities

_No entries yet._
