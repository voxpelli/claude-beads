# Agent B — Sub-Agent Sandbox Validation Findings

## V1: Documentation hunt

**Authoritative docs:**

- **Sandboxing** — https://code.claude.com/docs/en/sandboxing
  - The `sandboxed bash tool` uses **OS-level primitives** (bubblewrap+socat on Linux, Seatbelt on macOS) for filesystem and network isolation.
  - **Filesystem isolation:** by default, writes outside the working directory are kernel-blocked (`Operation not permitted`).
  - `npx @anthropic-ai/sandbox-runtime <cmd>` is the open-sourced sandbox primitive.
  - `dangerouslyDisableSandbox: true` **is documented**, but the docs say it "goes through the normal Claude Code permissions flow requiring user permission to execute" — i.e., it's a Bash-call parameter, not a per-agent launch flag. The user's session must be running in sandbox mode for it to matter, and even when set it should trigger a permission prompt.
- **Permissions** — https://code.claude.com/docs/en/permissions
  - `permissions.allow / ask / deny` rules live in `~/.claude/settings.json` (user), `.claude/settings.json` (project), `.claude/settings.local.json` (gitignored local). Rule syntax: `Bash(npm run:*)`, `Read(./.env)`, etc.
  - **deny is checked first and holds in every permission mode** — including `bypassPermissions`. (Quoting the Agent SDK permissions doc.)
- **Agent SDK permissions** — https://code.claude.com/docs/en/agent-sdk/permissions
  - Confirms 4 modes: `default`, `acceptEdits`, `bypassPermissions`, `plan`.
- **No public doc** found for "sub-agent permission inheritance" or a setting like `propagateToSubagents` — only the open FR (issue #27661 below).

## V2: Community discussion

- **Anthropic engineering — Claude Code auto mode** (https://www.anthropic.com/engineering/claude-code-auto-mode): introduces the **transcript-classifier safety layer**: "When the transcript classifier flags an action as dangerous, that denial comes back as a tool result along with an instruction to treat the boundary in good faith: find a safer path, don't try to route around the block." This is a SECOND restriction layer on top of `permissions.allow/deny`, evaluated by an Anthropic-side classifier on every tool call. It can deny commands that look dangerous (e.g., reading shell configs, scanning the filesystem) **without any project config** — and that classifier sees user messages + tool calls only, no model reasoning.
- **Simon Willison — Living dangerously with Claude** (https://simonwillison.net/2025/Oct/22/living-dangerously-with-claude/): "YOLO mode" = `--dangerously-skip-permissions`. Skips the entire prompt layer, but does NOT disable the sandbox or the classifier.
- **Reddit r/ClaudeAI/1p6ix5e** — "Claude Code subagents ignore your permissions.allow rules": user reports the same asymmetry empirically.
- **claudecodecamp.com** "Claude Code Sandboxing: How /sandbox Works" — confirms 4 key points:
  1. Filesystem writes are kernel-blocked outside cwd
  2. Network is proxied through localhost with allowlist (returns `CONNECT 403`)
  3. **Sandboxing is opt-in** — off by default until `/sandbox` is run
  4. `sandbox.denyRead` does not stop Claude's Read tool — separate permission system.
- **Pelle's Raindrop** — two bookmarks on this topic, both already linked:
  - https://code.claude.com/docs/en/sandboxing (the official docs)
  - https://www.anthropic.com/engineering/claude-code-sandboxing (design rationale)

## V3: Repo/issue hunt — `anthropics/claude-code`

Four highly-relevant filed issues. All four are CLOSED (state isn't necessarily "fixed" — could be "won't fix" or "duplicate"):

- **#18950** "Skills/subagents do not inherit user-level permissions from `~/.claude/settings.json`" (Claude Code 2.1.12)
  - Reproduces exact asymmetry: same command auto-approved in main thread, prompts in skill/subagent. Filed by user with full repro steps + workaround (re-add permissions at workspace level).
- **#25000** "[BUG] Sub-agents bypass permission deny rules and per-command approval — security risk" (2026-02-11, Claude Code 2.1.39)
  - **Opposite-direction asymmetry**: user had `"Bash"` in deny list; main session correctly prompts, but sub-agents launched via Task tool ran 22+ bash commands autonomously without any per-command approval. So sub-agents historically bypassed BOTH allow AND deny in different directions.
- **#27661** "Subagents should inherit parent session hooks and permission rules" (2026-02-22)
  - Filed FR; confirms `PreToolUse` hooks AND `permissions.allow/deny` AND `CLAUDE.md` do not propagate to subagents. Proposes `permissions.propagateToSubagents: true`. Lists related issues #10906, #16461, #5465.
- **#34315** "dangerouslyDisableSandbox bypasses sandbox without user approval prompt" (2026-03-14)
  - Confirms `dangerouslyDisableSandbox: true` on a Bash call DOES bypass the OS sandbox — but silently, without the prompt that the system prompt promises. Implication: **the parameter does work, but only against the sandbox layer (Seatbelt/bubblewrap), not against the permissions allow/deny layer or the transcript classifier.** Pelle's original claim that "`dangerouslyDisableSandbox: true` set on agent launch" didn't work is therefore plausibly explained by: (a) `dangerouslyDisableSandbox` is a per-Bash-call param, not an agent-launch param (so it may not have actually been set), AND (b) even if set, it doesn't override `permissions.allow` denial in the parent inheritance.

## V4: Empirical re-test (in YOUR sub-agent context)

Tests run from within this validation sub-agent in /Users/pelle/Sites/ai/vp-beads:

| Operation | Result | Notes |
|---|---|---|
| `echo X > /tmp/sandbox-test-B.txt && cat /tmp/sandbox-test-B.txt` | **WORKED** | File created, read, then cleaned up |
| `echo "tmp write test 2" > /tmp/sandbox-test-B3.txt` | **WORKED** | Plain redirect, no output |
| `which npx; which brew; which gh` | WORKED | All three on PATH; brew is aliased to `op plugin run -- brew` |
| `npx --version` | **DENIED** | "Permission to use Bash has been denied" |
| `npx --yes cowsay@latest hello` | DENIED | Same denial (one-shot install) |
| `brew --version` | **DENIED** | Same denial |
| `gh --version` | **DENIED** | Same denial (just `--version`!) |
| `gh api /user` | **DENIED** | Same denial |
| `cat /Users/pelle/.claude/settings.json` (via Bash) | DENIED | Via Bash and via `Read` tool both — sub-agent can't read user-config dir |
| `Read(/Users/pelle/.claude/settings.json)` | **DENIED** | Read tool itself denied, not just Bash |
| `cat /Users/pelle/Sites/ai/vp-beads/.claude/settings.local.json` | WORKED | Project-local file readable |

**Critical asymmetry:** `/tmp/` writes succeeded but `npx --version` (a trivially safe read of a version string) failed. This is NOT a sandbox restriction (which would block `/tmp/` first). This is **the `permissions.allow` system not inheriting** — exactly as filed in #18950. The project's `settings.local.json` allows `Bash(npx -y backlog.md@latest --version)` but not `Bash(npx --version)`, and lacks any `gh --version` / `brew --version` entries. Main thread would prompt-and-add; sub-agent denies outright.

The `/tmp/` write probably worked because Pelle's session is running with sandbox mode **off** (the default) — kernel filesystem isolation isn't engaged. Had sandbox mode been on, `/tmp/` would also block (kernel blocks writes outside cwd).

## V5: Settings.json incantations

**Inheritance is the unsolved problem.** Per issue #27661, there is no current setting that propagates the parent's allow/deny rules to subagents. Workarounds documented in the wild:

1. **Per-agent `allowed-tools` frontmatter** — define each subagent under `.claude/agents/<name>.md` (or `agents/` in the plugin) with explicit `allowed-tools: Bash(npx:*)` etc. This is the **only first-class mechanism**; the cost is each tool needs to be enumerated per agent type. (Cited in #27661 as the "fragile workaround.")
2. **Re-add permissions at workspace level** (per #18950) — duplicate user-level allows into `.claude/settings.json` (project) or `.claude/settings.local.json`. Tested partially: even with a curated `settings.local.json` (this very project), commands NOT on the list still deny.
3. **`bypassPermissions` mode for the subagent** — Agent SDK exposes `permission_mode="bypassPermissions"`. Risky and global to that subagent; doesn't override `deny` rules (deny is checked first per docs).
4. **`--dangerously-skip-permissions` (YOLO mode)** — global escape hatch for the whole session, not subagent-scoped.
5. **Main-thread takeover** — what Pelle did. Works because main thread sees the full permission tree.

No "magic" pattern found that selectively opens just the subagent's bash without re-enumerating tools.

## Verdict on each sub-claim

- **Sub-claim 1: "/tmp/ writes blocked in sub-agents" → REFUTED (in this environment)**
  - Empirically `/tmp/` writes succeeded for me. Pelle's report of failure is more likely explained by: (a) his project had a different allowlist shape that triggered the prompt+denial flow, or (b) the operation Pelle tried was a chained `npx ... > /tmp/` where the `npx` (not the `/tmp/`) is what was blocked. Confirmed restriction would only apply with `/sandbox` mode ON, which is opt-in per the docs.
- **Sub-claim 2: "npx/brew blocked in sub-agents" → CONFIRMED (with mechanism)**
  - Mechanism is NOT a sandbox restriction. It's `permissions.allow` failing to inherit from user-level settings into the subagent (issue #18950). With no matching allow rule, the subagent prompt is auto-denied because the user can't see/approve it in the parent UX.
- **Sub-claim 3: "gh api blocked in some sub-agent contexts" → CONFIRMED (same mechanism)**
  - Even `gh --version` was denied for me. Same root cause as npx/brew — not on the project allowlist, doesn't inherit from user-level.
- **Sub-claim 4: "dangerouslyDisableSandbox: true doesn't override" → NUANCED**
  - The parameter is **per-Bash-call**, not per-agent-launch. If Agent A reported setting it "on the agent launch", that report is mechanically wrong — there's no such launch param. The real mechanism is: Claude (the model in the subagent) adds `dangerouslyDisableSandbox: true` to a Bash tool input when retrying after a sandbox failure (per #34315). That override only addresses the OS-sandbox layer, not the `permissions.allow` layer that's actually failing here. So the parameter "didn't work" because it's targeting the wrong layer — there are at least three independent restriction systems (OS sandbox / permissions allow-deny / transcript classifier), and `dangerouslyDisableSandbox` only addresses the first.
- **Sub-claim 5: "Main thread has no restrictions" → NUANCED**
  - Main thread can interactively prompt the user to add a new rule and persist it. Sub-agents can't surface those prompts visibly enough to be approved before the call returns denied. The main thread isn't "unrestricted" — it just has an interactive escape valve the sub-agent lacks.

## Recommended rewrite of the proposed observation

```
Sub-agents launched via the Task tool do not inherit `permissions.allow` rules
from `~/.claude/settings.json` or `.claude/settings.local.json` (filed as
anthropics/claude-code#18950). Bash commands that auto-run in the main thread
prompt-and-deny in the subagent context — observed empirically for `npx
--version`, `brew --version`, `gh --version`, `gh api /user`, and arbitrary
reads under `~/.claude/`. The asymmetry is a permissions-inheritance bug, not
the OS sandbox (which is opt-in via `/sandbox` and off by default).

The parameter `dangerouslyDisableSandbox: true` is a per-Bash-call input, not
an agent-launch flag; even when set it only bypasses the OS sandbox layer, not
the `permissions.allow` layer that's the actual blocker here (see
anthropics/claude-code#34315 + #27661 for context).

Three independent restriction layers exist: (1) the `permissions.allow/ask/deny`
rule engine (the one that bites subagents), (2) the optional OS sandbox via
Seatbelt/bubblewrap (off by default), (3) a server-side transcript classifier
that can deny operations it judges dangerous regardless of local config. Only
(2) is what `dangerouslyDisableSandbox` overrides.

Pattern: when a subagent task needs operations not on the project allowlist:
  (a) FIRST CHOICE — declare them in the agent's `allowed-tools` frontmatter
      (`.claude/agents/<name>.md` or plugin `agents/`) — first-class mechanism
      per the Agent Skills spec.
  (b) SECOND CHOICE — pre-add the exact `Bash(<cmd>:*)` pattern to project
      `.claude/settings.json` (committed) or `settings.local.json` (gitignored)
      before launching the wave.
  (c) FALLBACK — main-thread takeover for genuinely sandbox-incompatible
      operations or one-off needs where enumerating allow rules is overkill.
```

## Recommended pattern (vs "take over from main thread")

`allowed-tools` frontmatter on the sub-agent definition is the **first-class fix**, and is already part of the Agent Skills standard (https://agentskills.io/specification, validated in Pelle's own `validate-plugin.mjs` tool-reference audit). Pre-curating `permissions.allow` patterns in `.claude/settings.json` is the second-class fix. Main-thread takeover should be reserved for genuinely one-off cases — repeated takeovers signal a missing `allowed-tools` declaration.

For vp-beads specifically: when writing a research sub-agent that needs `npx`, `brew`, or `gh api`, add `Bash(npx:*)`, `Bash(brew:*)`, `Bash(gh api:*)` to that agent's `allowed-tools` (not to global settings). The plugin's validate-plugin.mjs tool-reference audit already enforces tool declarations — extending that pattern to bash-command patterns would catch this gap class.
