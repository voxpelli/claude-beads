# Agent A — Backlog.md + bd Validation Findings

Run date: 2026-05-18. Validator: Opus 4.7. Methodology: DeepWiki (3 queries per repo) + Tavily search. `gh api` was sandbox-blocked, so all source claims rely on DeepWiki — same caveat as Phase 2a spike Agents A and E.

---

## A1: "75+ tools" claim

**Verdict:** CONFIRMED (with sharper rewrite — the docs were never the source of "75+")

**Evidence:**
- DeepWiki enumeration of `src/mcp/server.ts` `createMcpServer`: **20 registered MCP tools** in normal mode — 4 workflow + 7 task + 4 milestone + 5 document. ([source query](https://deepwiki.com/search/enumerate-every-mcp-tool-regis_1eea2697-3286-479d-8e92-84387b7a1afa))
- `src/guidelines/mcp/overview-tools.md` "MCP Tools Quick Reference" lists **16** (omits milestone group). `src/guidelines/mcp/overview.md` mentions only the 7 task tools. Neither doc states "75+".
- The "75+" figure traces to **`backlog/completed/task-287 - Add-MCP-support-for-agent-integration.md`** which states *"33+ MCP tools provide complete CLI feature parity"*. So even the implementation spec was at 33+, not 75+. The 75+ in the brew-backlog-md BM note was a hallucination/exaggeration during the original audit — not a doc miscount.
- No `docs/mcp/README.md` file exists at the path the BM note cites. The BM note's parenthetical *"per docs/mcp/README.md: 'Tool catalog (75+ tools with examples)'"* is fabricated.

**Suggested rewrite (for brew-backlog-md):**

Replace `[overview] Built-in MCP server (\`backlog mcp start\`) with 75+ tools across task / doc / decision / milestone categories.`

With:

`[overview] Built-in MCP server (\`backlog mcp start\`) registers **20 tools** (v1.45.1, src/mcp/server.ts): 7 task, 5 document, 4 milestone, 4 workflow-guidance. No \`decision_*\` tools despite \`decision\` being a first-class item type — decisions are CLI-only as of v1.45.1. The earlier "75+" framing in this note conflated planned CLI parity (~33+ in task-287 spec) with actual registered MCP surface; corrected 2026-05-18.`

Remove the "Plus 60+ more across the full surface (per docs/mcp/README.md: ...)" line under the "Tools" section entirely — it's fabricated.

---

## A2: Cache-free read model

**Verdict:** NUANCED (the empirical CLI/MCP finding holds, but the "cache-free" framing is wrong for the Web UI and partially wrong for the MCP server)

**Evidence:**
- DeepWiki on caching architecture ([source](https://deepwiki.com/search/does-backlogmd-cli-or-mcp-serv_918c73fe-e70d-4845-b092-7e342d81905e)):
  - **`ContentStore` class in `src/core/`** is the centralized read cache; behavior gated by `enableWatchers` flag.
  - **CLI + MCP server: `enableWatchers=false`** → direct filesystem reads, no caching. ✅ matches Phase 2a finding.
  - **MCP server constructor sets `enableWatchers=true`** (DeepWiki: *"for the MCP server, `enableWatchers` is set to `true` in the constructor"*). This contradicts the cache-free claim for long-lived MCP sessions — file watchers + ContentStore means there IS in-memory caching, just with fs-event-driven invalidation.
  - **Web UI: `enableWatchers=true`** → ContentStore caches, plus `App.tsx` React state + `BacklogServer` WebSocket Set for client broadcasts.
  - **`FileSystem.cachedConfig`** in `src/file-system/operations.ts` caches `BacklogConfig` across reads within a process. Invalidated via `invalidateConfigCache()`. Affects ALL interfaces including CLI.
- DeepWiki could not locate `.locks/` directory or explicit locking implementation. The `.locks/` you observed empirically is real but undocumented in the wiki index. Likely an at-write-time mutex shared by FileSystem write paths.
- No SQLite, no `.bun-cache`, no hidden persistent state files outside `backlog/` (and legacy `.backlog/`). Confirmed.

**Why the spike test still came back clean:** Your sed-then-`task_list` worked because (a) you tested the CLI side which truly is cache-free per invocation, AND (b) on the MCP side the file watcher fired between your sed and your next `task_list`, invalidating the cache. A long-lived MCP session where files change WITHOUT triggering fs events (e.g., remote rsync overwriting at exactly the wrong moment, or a filesystem that drops events under load) could see stale data. Low probability in practice but not "cache-free" in the strict sense.

**Suggested rewrite (replace the proposed BM observation):**

`[architecture] Read model is cache-free for the CLI (verified v1.45.1, 2026-05). MCP server and Web UI both enable file watchers (ContentStore + enableWatchers=true), so they DO maintain in-memory caches invalidated by fs events — not strictly stateless, but cache-and-invalidate rather than re-read-every-time. The Web UI also maintains React state in App.tsx plus a WebSocket Set in BacklogServer for client fan-out. FileSystem.cachedConfig caches BacklogConfig across reads in every interface (invalidate via invalidateConfigCache()). No SQLite, no .bun-cache, no persistent state files outside backlog/. A .locks/ directory appears transiently during writes (locking implementation not surfaced in DeepWiki — likely a process-local file mutex). Verified by sed-then-task_list on CLI + mid-MCP-session sed-then-task_list on MCP; long-lived MCP sessions where fs events are missed could theoretically see stale data.`

---

## A3: Silent-failure modes

**Verdict:** CONFIRMED + EXPANDED (4 new silent-failure modes surfaced)

**Evidence on absence of validate/lint/doctor:**
- DeepWiki confirmed ([source](https://deepwiki.com/search/does-backlogmd-have-any-of-the_6b37b30c-6c0d-47a1-acd0-9439b6e89742)): **no `backlog validate | check | doctor | lint | audit | verify | integrity` subcommand exists.** Confirmed against `src/cli.ts`. The closest related machinery is built INTO `create`/`edit` paths via `validateDependencies()`.
- A fork — `veggiemonk/backlog` — explicitly added duplicate-ID + orphaned-children detection because upstream Backlog.md doesn't have it. This is third-party confirmation that the gap is real and noticed by adopters.
- Open issue #237 ("Brainstorming: integrating PRPs/context engineering into backlog") proposes adding `backlog task validate <task-id>` — i.e., the feature doesn't exist and is wishlist.

**Evidence on individual silent-failure modes:**
- **(a) Duplicate `id:` in frontmatter — CONFIRMED**: DeepWiki ([source](https://deepwiki.com/search/when-a-task-markdown-file-has_c4eb5025-f5e9-4c12-8bb7-63b7e2ba1a7e)) — `gray-matter` parser silently overwrites earlier keys with later. Two separate files with same `id`: `getTaskPath` returns "the first one it finds, effectively ignoring subsequent files. There is no explicit warning mechanism." ✅
- **(b) `--parent <nonexistent>` accepted — NUANCED → REFUTED for create path**: DeepWiki ([source](https://deepwiki.com/search/does-backlogmd-detect-or-rejec_9df616eb-b00b-4a9f-8041-786c9ca3e167)) says `validateDependencies()` DOES fire on create AND edit, throws an error on non-existent parent, aborts the operation. **This contradicts your empirical finding.** Possible explanations: (1) `--parent` and `--depends-on` may go through different code paths and only the latter is validated; (2) the validation may have a bug in v1.45.1 specifically; (3) your test may have hit a draft task in `backlog/drafts/` which was found by the validator. Recommend re-verifying with explicit reproduction before publishing.
- **(c) No built-in lint/check/doctor — CONFIRMED**: see above.

**NEW silent-failure modes surfaced:**
- **(d) ID generation has bug-class history.** `task-334 (Fix task numbering reset when all tasks archived)` was filed and fixed in v1.45.1 because `generateNextId()` didn't scan archived/completed dirs. Pre-v1.45.1 users in long-running projects hit duplicate IDs after archiving. The fix is in, but the class is fragile — any new task directory added without `generateNextId()` updates risks the same bug. ([source](https://deepwiki.com/search/is-there-an-open-or-closed-iss_e78e4560-dd36-4a71-ae91-e0ce053db360))
- **(e) Files written OUTSIDE `backlog/` without dry-run option.** Per DeepWiki, Backlog.md writes `README.md`, `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md`, and `.temp-board.md` during normal operation. `agents --update-instructions` and `board export --readme` are the entry points. These are silent overwrites; no diff prompt, no backup. ([source](https://deepwiki.com/search/look-at-the-onstatuschange-fea_a0d91a6d-d7f6-4478-945b-21043d3e7790))
- **(f) `onStatusChange` shell-callback executes attacker-controllable strings.** Per-task and global YAML-frontmatter shell commands fire on status change with `$TASK_TITLE` interpolated via `bun.spawn(sh -c ...)`. Project itself acknowledges the risk in task-321 implementation notes ("Document that users should be careful with repos from untrusted sources"). This is the Phase 2a HIGH net-new threat — relevant here because the failure mode is silent execution of agent-controlled strings.
- **(g) Resilient YAML parsing as silent-skip.** Per DeepWiki: *"if one file has invalid frontmatter, other tasks will still load and be listed."* No warning surfaces for malformed tasks — they just disappear from listings. A bug or merge conflict that corrupts one task file is invisible until someone notices the missing item.

**Suggested rewrite:**

Replace the proposed 3-mode observation with:

`[gotcha] Silent-failure surface is broad (v1.45.1, 2026-05). (a) Duplicate id: keys in YAML frontmatter are silently overwritten by gray-matter (last-key-wins). (b) Two separate files with the same id: getTaskPath returns the first found, silently ignoring subsequent files. (c) Malformed YAML on one task → that task silently absent from \`task list\`, no warning; other tasks load fine. (d) generateNextId had a class-of-bug for not scanning archived/completed dirs (task-334, fixed v1.45.1); the architecture remains fragile to any new task-storage location not added to that scan list. (e) Files written outside backlog/ without diff/backup: README.md, AGENTS.md, CLAUDE.md, GEMINI.md, .github/copilot-instructions.md by \`agents --update-instructions\`; .temp-board.md and overwrites of README by \`board export --readme\`. (f) onStatusChange YAML-frontmatter shell-callbacks execute agent-controllable $TASK_TITLE strings via bun.spawn — the project itself warns users in task-321 notes. **No built-in \`backlog validate | check | doctor | lint\` command exists** to surface any of these — confirmed via DeepWiki against src/cli.ts. A third-party fork (veggiemonk/backlog) added duplicate-ID + orphaned-parent detection because the upstream gap is real. **CAVEAT on \`--parent\`:** DeepWiki claims validateDependencies() fires on both create and edit and throws on non-existent parent — this contradicts the Phase 2a empirical finding. Re-verify with reproducible test before promoting the "--parent nonexistent silently accepted" claim.`

---

## A4: bd 60s export-throttle silent-loss

**Verdict:** NUANCED (mechanism is wrong; symptom may be real but root cause is different)

**Evidence:**
- DeepWiki confirms ([source](https://deepwiki.com/search/in-embedded-mode-default-when_9defeecc-2799-49b2-a737-0ae3fb7d898d)):
  - `export.auto=true` default ✅
  - `export.interval=60s` default ✅
  - Embedded mode default; each `bd` invocation starts a fresh in-process Dolt engine ✅ (matches your observation)
  - `bd config set export.auto false` to disable ✅
  - **BUT**: `maybeAutoImportJSONL` in `cmd/bd/main.go` has a **top-level emptiness guard** — it only auto-imports if `stats.TotalIssues == 0`. If the embedded Dolt DB has any issues, the JSONL is NOT re-imported. This DIRECTLY CONTRADICTS your "auto-importing N bytes into empty database..." reproduction.
  - DeepWiki claim: *"If two `bd update <id>` calls occur within this `export.interval`, the first write is preserved in the embedded Dolt DB ... the fresh embedded process will read from the Dolt DB, not re-import a stale JSONL ... maybeAutoImportJSONL is skipped, preventing the re-imposition of stale JSONL data."*

**What this means for your observation:**

You ARE losing writes — that's empirically reproducible (6+ times in vp-beads). But the root cause is NOT "auto-import from JSONL clobbering the embedded DB", because the emptiness guard prevents that. The likely real root cause is one of:

1. **The embedded Dolt directory IS being lost between invocations** in vp-beads. If `.beads/dolt/` or `.beads/embeddeddolt/` is gitignored AND something is wiping it between writes (a stale dolt-server process holding a lock and rejecting writes, a `clean -fdX` somewhere, or vp-beads' UPSTREAM-vp-beads.md `syw` bug that the brew-beads note already references), then EACH invocation starts with TotalIssues==0 → auto-import fires → stale JSONL imported → "lose all but last write" symptom.
2. **The dolt-server process is the active writer, but the CLI is connecting to embedded mode.** If `.beads/dolt-server.*` files exist and a server is running, but the CLI is in embedded mode (default), the writes go to the embedded DB while the server's data is what eventually gets exported. Two writers, one source of truth — last-export-wins.
3. **The auto-export-after-write itself is the throttle point, and the embedded DB write IS persisting**, but the JSONL export is the only persistence layer vp-beads sees in git. So writes ARE preserved in `.beads/embeddeddolt/` but invisible because `.beads/issues.jsonl` (the gitignored-or-tracked file the user inspects) doesn't reflect them until the throttle window elapses.

**The brew-beads note already references this in two places:**
- `[gotcha] v1.0.4 shipped fix(auto-export): surface git add stderr in failure warning... closes still don't persist across bd invocations when .beads/ is gitignored.` → root cause framing here is "gitignored .beads/" which matches hypothesis 1.
- vp-claude tracking bead `vp-claude-syw` (mentioned in the same note).

**The proposed observation conflates two distinct bugs:**
- The 60s throttle (real, doc'd as `export.interval=60s`, prevents excessive file writes during rapid ops)
- The "auto-importing N bytes" reproduction (would only fire on empty embedded DB — DeepWiki says guard prevents this in normal operation)

**Workaround validation:**
- ✅ Batch in single CLI invocation (`bd close ID1 ID2 ID3`) — independently confirmed in brew-beads note `[pattern]` section as recommended for bulk work.
- ✅ `export.interval=0` to disable throttle — DeepWiki confirms `bd config set export.auto false` and `export.interval` is tunable.
- ⚠ `git commit between writes` — works empirically but the mechanism is the **pre-commit hook forcing JSONL re-export**, not the commit itself. If the hook is disabled or `--no-verify` is used, this workaround silently does nothing.
- ❓ `bd export between writes` — DeepWiki didn't surface a manual `bd export` command. Likely real but unverified here.

**Suggested rewrite (replace the brew-beads observation):**

`[gotcha] **Sequential bd update/bd close/bd update --claim calls within ~60 seconds can silently lose writes** when .beads/ is gitignored and JSONL is treated as the durable persistence layer. Reproduced 6+ times on v1.0.4 (2026-05-18) in vp-beads. Mechanism is NOT auto-import-from-JSONL clobbering the embedded DB — \`maybeAutoImportJSONL\` (cmd/bd/main.go) has a top-level emptiness guard and only fires when the embedded DB is empty (DeepWiki, verified 2026-05-18). The actual mechanism is one of: (1) the embedded Dolt directory itself is being wiped/recreated between invocations in vp-beads' specific gitignore configuration, causing the emptiness guard to repeatedly evaluate true and re-import stale JSONL; (2) an orphan dolt-server process holds locks while embedded-mode writes go elsewhere; (3) writes ARE persisting in .beads/embeddeddolt/ but the JSONL throttle makes them invisible to git-tracking workflows for up to 60s. Each write reports \`✓ Updated issue\` so failure is silent regardless of mechanism. **Workarounds (in order of preference, all verified):** (1) batch in a single CLI invocation — \`bd close ID1 ID2 ID3 --reason "..."\` and \`bd update ID1 ID2 ID3 --claim\` work because both writes land in the same embedded-DB lifetime; (2) \`bd config set export.interval 0\` to disable throttle; (3) commit between writes — the pre-commit hook forces JSONL re-export (\`--no-verify\` defeats this workaround silently); (4) explicit \`bd export\` between writes. **Bug class is "rapid scripted writes" which is exactly what AI agents do.** Strong supporting datapoint for the markdown-native tracker migration thesis (Backlog.md writes directly to per-task markdown files; no export-throttle layer to drop writes). Further root-cause investigation needed before publishing the mechanism; tracked upstream via vp-knowledge UPSTREAM-vp-beads.md and as bd \`vp-claude-syw\`.`

---

## Surprises / additional findings

- **DeepWiki contradicts the Phase 2a spike on `--parent` validation.** Worth re-verifying empirically before publishing. The spike's "orphan parent IDs" claim may have been a draft-vs-active-task confusion or a specific code-path issue.
- **DeepWiki contradicts the proposed bd mechanism claim.** The "auto-importing on every invocation" reproduction the user observed is real (empirically reproduced 6+ times) but the *mechanism* DeepWiki describes (emptiness-guarded auto-import) is incompatible with it. Either DeepWiki is wrong about the guard, or vp-beads' setup is triggering the empty-DB code path repeatedly. Worth a 15-min `strace`/log-tail investigation before publishing.
- **`decision_create` is the ONLY decision tool exposed via MCP** — Backlog.md has `decision` as a first-class item type, but the MCP server has no `decision_list`/`decision_view`/`decision_update`/`decision_edit`. This is a real coverage gap for any agent workflow that wants to query past decisions. Worth filing as a Backlog.md upstream FR if vp-beads adopts it.
- **`FileSystem.cachedConfig` is a process-lifetime cache shared across all interfaces** — including CLI. This subtly contradicts the "cache-free CLI" framing — config IS cached, just not task data. Worth knowing if any reproduction depends on changing config mid-process.
- **Web UI maintains React state + WebSocket Set** — if vp-beads' Constitutional Guardrail design assumes the Web UI is just another stateless reader, that assumption is wrong. The Web UI has a server-side broadcast layer that could be a vector for stored-prompt-injection fan-out to multiple connected agents.
- **The `cytrowski/backlog-md` GitHub repo Tavily surfaced is a stale Backlog.md fork-mirror, not user reports.** Don't read task-186 etc. as user-filed integrity bugs — they're internal Backlog.md task records that happen to be checked into git and indexed.
