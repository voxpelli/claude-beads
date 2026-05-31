# Agent D — Empirical verification of sub-agent permissions workarounds

Probe date: 2026-05-18. Agent type: one-off Task-tool sub-agent (no `.claude/agents/` definition, no `allowed-tools` frontmatter on the launch).

## V1: /tmp/ writes from YOUR context

**WORKED.** Command: `echo "agent-d-probe content" > /tmp/agent-d-probe.txt && cat /tmp/agent-d-probe.txt`. Exit 0. File created and readable.

This **confirms Agent B's refutation** of the original "/tmp/ blocked in sub-agents" claim. The OS sandbox is not engaged in this session (sandbox mode is opt-in via `/sandbox`, off by default). Pelle's original observation was therefore mis-diagnosed — the failures he saw were `permissions.allow` denials, not kernel `/tmp/` blocks.

## V2: npx-style permission-needing command

**DENIED.** Command: `npx --version`. Exact error message returned to me:

> Permission to use Bash has been denied. IMPORTANT: You *may* attempt to accomplish this action using other tools that might naturally be used to accomplish this goal, e.g. using head instead of cat. But you *should not* attempt to work around this denial in malicious ways…

No exit code is exposed (it's a tool-layer denial, not a shell exit). Mode is `denied`, not `hung` or `blocked`. The denial is **synchronous and silent to the user** — the parent thread does not see a permission prompt because the sub-agent has no UX to surface it. Same pattern observed for `gh --version`.

Confirms B's "main thread can prompt, sub-agent can't" claim. Mechanism: the harness's permission-prompt UI is bound to the active conversation, not to sub-agent tool calls.

## V3: Local MCP server reachability

**DENIED — important data point.** Tried `mcp__backlog__task_list` (no args). Exact error:

> Permission to use mcp__backlog__task_list has been denied. […]

The MCP server is **registered and resolvable** from sub-agent context (ToolSearch found its schema; the call dispatched). The denial happens at the *permissions layer*, not at MCP discovery. Cross-check: `mcp__deepwiki__ask_question`, `mcp__tavily__tavily_search`, `mcp__tavily__tavily_extract` all worked — the difference is those three names appear in `.claude/settings.local.json` `permissions.allow`; `mcp__backlog__task_list` does not.

**Implication**: MCP tool *registration* inherits fine (the sub-agent sees the tool); only `permissions.allow` doesn't inherit. To use the local backlog MCP server from sub-agents, every `mcp__backlog__*` tool must be added to `.claude/settings.local.json`.

## V4: ToolSearch behavior

**WORKED.** `ToolSearch` loaded the `mcp__backlog__task_list` schema and several Bash-permission-related tools (Monitor, WebFetch) without restriction. ToolSearch itself is harness-level and not gated by `permissions.allow`. This is how the sub-agent discovers tool surface area even when individual tool calls are denied.

## V5: Upstream issue verification

Concrete findings — all four issues exist and frame this as a real, ongoing inheritance bug:

- **#18950** "Skills/subagents do not inherit user-level permissions from settings.json" — https://github.com/anthropics/claude-code/issues/18950. Title and body confirm B's framing. **Workaround the issue itself recommends:** "Select option 2 to create workspace-level permissions, but this defeats the purpose of user-level permissions." That is, when the prompt appears in main thread, choose the "add to project `.claude/settings.local.json`" option, not the "add to user settings" option. This is **Tier 2** in B's hierarchy — and it's the workaround the issue author explicitly endorses (while complaining about it).
- **#22665** "Subagent (Task tool) does not inherit permission allowlist from settings.json" — https://github.com/anthropics/claude-code/issues/22665. Filed independently. Confirms the Task tool specifically (which is how this sub-agent was launched) drops the parent's allowlist. No workaround documented in the body beyond "manually approve each command."
- **#14714** "Subagents (Task tool) don't inherit parent conversation's allowed tools" — https://github.com/anthropics/claude-code/issues/14714. Third independent filing of the same bug. Notes the friction with "parallel agent workflows" — directly relevant to swarm-wave.
- **#27661** "Subagents should inherit parent session hooks and permission rules" — present in search results, formal FR; proposes `permissions.propagateToSubagents: true`.
- **#57118** "[BUG] Sub-agent permission mode inheritance broken — permissionMode frontmatter and parent acceptEdits both ineffective" — confirms that even `permissionMode: acceptEdits` in the sub-agent frontmatter **does not propagate** in some cases. So **Tier 1 is also nuanced**, not bulletproof.

**DeepWiki cross-check** of CHANGELOG history confirmed:
- v2.0.43 added `skills` frontmatter for auto-loading subagent skills
- v2.0.47 included "handling of subagent permissions" fix
- v2.0.72 fixed `skill allowed-tools` not being applied to tools invoked by the skill
- v2.1.101 fixed sub-agents not inheriting MCP tools from dynamically-injected servers
- v2.1.121 fixed `Skill(name *)` prefix-match behavior

Active development on this surface — the bug class is acknowledged and partially being fixed version-over-version. No "the inheritance is now correct" fix has shipped as of these CHANGELOG entries.

## V6: Transcript classifier

**Real and confirmed** — Anthropic engineering post at https://www.anthropic.com/engineering/claude-code-auto-mode. Key facts (from the page + secondary coverage):

- The classifier sits between the agent and every tool call in **auto mode** (specifically — it's the safety mechanism that backs the new "auto mode" replacing `--dangerously-skip-permissions`).
- It is "reasoning-blind by design": sees user messages + tool calls only, not Claude's internal messages or tool outputs.
- When it flags an action, the denial is returned as a tool result with an instruction to "treat the boundary in good faith: find a safer path, don't try to route around the block."
- Cost: every check sends conversation transcript + pending action to the classifier (token overhead).

**Relevance to sub-agent Bash specifically: LOW.** The transcript classifier is a separate, runtime-only restriction layer that becomes the dominant gate when auto mode is enabled (replacing the per-prompt approval UX). It does NOT explain the sub-agent permission-inheritance failures we're seeing — those happen in default mode, with no auto mode involved, and the failure mode is "permission denied with prompt message," not "good-faith denial with safer-path instruction." B was right to mention the classifier exists as a third layer, but it's NOT what's biting us.

## V7: `allowed-tools` frontmatter applicability

**This is the key nuance B's report glossed over.**

The `allowed-tools` frontmatter is defined on **user-authored agent files** at `.claude/agents/<name>.md` (per-project) or `~/.claude/agents/<name>.md` (user-global). It is a **first-class mechanism** — confirmed by:

- The Hightower "Approval Hell to Just Do It" article (https://medium.com/@richardhightower/...) describing the Claude Code 2.1 architecture: "When Claude Code forks into an agent, it can only use the tools in that agent's `allowed_tools` list."
- The prg.sh "Claude Code Subagents" notes showing the full frontmatter shape (`tools:`, `disallowedTools:`, `model:`, `permissionMode:`, `skills:`, `hooks:`).
- CHANGELOG v2.0.72 confirming `skill allowed-tools` exists for skills too.

**But:** one-off Task-tool launches (like the agents in this very swarm wave, and like ME) do NOT have a persistent file with frontmatter. The Task tool launches a sub-agent from a transient prompt + tool list passed at call time. The model invoking the Task tool can specify a `subagent_type` and tool restrictions, but it cannot inject `allowed-tools` frontmatter post-hoc.

**Conclusion for V7:** B's "Tier 1 — `allowed-tools` frontmatter" recommendation **applies to user-defined named agents at `.claude/agents/<name>.md`**. It **DOES NOT apply** to ad-hoc Task-tool sub-agents launched from a prompt — those agents have no frontmatter file to add `allowed-tools` to. Issue #57118 further shows that even when `permissionMode: acceptEdits` IS in the agent frontmatter, it sometimes still doesn't propagate. So Tier 1 is both scope-limited and not bulletproof.

## Verdict on B's recommended pattern hierarchy

**Tier 1 (`allowed-tools` frontmatter on the sub-agent):**
- **WORKS for** named agents defined in `.claude/agents/<name>.md` (or plugin `agents/`) — this is the policy-island architecture, the canonical 2.1 mechanism.
- **DOES NOT APPLY to** one-off Task-tool launches from a prompt — there is no frontmatter file to attach the rules to.
- **NUANCED:** per #57118, `permissionMode` in frontmatter may still fail to propagate. `allowed-tools` per-tool entries appear to be more reliable than mode-level inheritance.

**Tier 2 (pre-curated `permissions.allow` in `.claude/settings.local.json`):**
- **WORKS** — confirmed empirically: every MCP tool and Bash command that succeeded in this sub-agent context was on the allowlist; every one that failed was not. This is **the workaround #18950 itself recommends** ("select option 2 to create workspace-level permissions").
- Pattern syntax matters: `Bash(npx -y backlog.md@latest --version)` allows ONLY that exact string; `Bash(npx:*)` allows the npx prefix. The current `.claude/settings.local.json` mixes both styles.
- The cost is enumeration burden — every external CLI invocation must be pre-listed.

**Tier 3 (main-thread takeover):**
- **CONFIRMED** — this is what we've been doing all session. Always works because the main thread sees the prompt UI.

## Revised pattern recommendation

For vp-beads CLAUDE.md and swarm-wave operations, recommend this layered pattern:

1. **For swarm-wave sub-agents (ad-hoc Task-tool launches)** — there is NO frontmatter mechanism. **Pre-curate `.claude/settings.local.json`** with the Bash and MCP patterns the wave needs. This is non-negotiable when the wave needs `npx`, `gh`, `brew`, or a local MCP server like `mcp__backlog__*`.

2. **For repeatable named agents** (e.g., sprint-review-style proactive agents) — declare them as `.claude/agents/<name>.md` (or in plugin `agents/`) with explicit `allowed-tools` frontmatter. This survives session restarts and is auditable.

3. **For one-off operations needing rare/dangerous tools** — main-thread takeover. Not a workaround failure; a deliberate design choice when enumerating allow rules would be overkill.

**Concrete config snippet — add to `.claude/settings.local.json` `permissions.allow` for a swarm wave that needs the local backlog MCP server and external CLIs:**

```json
"mcp__backlog__task_list",
"mcp__backlog__task_view",
"mcp__backlog__task_create",
"mcp__backlog__task_edit",
"mcp__backlog__document_list",
"mcp__backlog__document_view",
"Bash(npx:*)",
"Bash(gh api:*)",
"Bash(gh repo view:*)",
"Bash(brew info:*)",
"Bash(brew search:*)"
```

**Validator extension opportunity for vp-beads:** the existing `validate-plugin.mjs` tool-reference audit already flags missing `allowed-tools` for plugin-internal MCP tools. Extending it to **also detect Bash-pattern mentions** (`npx`, `gh api`, etc.) in skill/agent prose and warn if no matching `Bash(<cmd>:*)` is in the plugin's recommended permissions documentation would catch this gap class at plugin development time.

**What NOT to recommend:** `dangerouslyDisableSandbox: true` on Bash calls. Per #34315 it targets the wrong layer (OS sandbox, which isn't even on by default), and gives the false impression of a fix. Per B's V4 it didn't work in Agent A's wave precisely because the actual blocker was `permissions.allow`, not the sandbox.
