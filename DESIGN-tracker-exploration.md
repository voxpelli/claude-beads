# vp-beads-tracker Design Exploration (2026-05 v2 → 2026-06 v3)

> **Lead motif** _(every design decision in this document defers to this sentence; if a proposed feature doesn't serve it, the feature gets deferred or cut):_
>
> **Sprint workflow choreography for solo developers running Claude Code agent swarms — with constitutional safety middleware and Basic Memory graph integration.**

> **v2 changelog (2026-05-18 evening session).** Stripped bd-cruft uncritically imported in v1 (`bd remember`, 9 issue types, hard validation, "cross-project sync as tracker concern"). Switched architecture to follow `harvmcp` + `weft-ai` prior-art templates: standalone npm package (not embedded sub-directory), triple-facade pattern, lean v1 MCP shape (no resources). Added open-core / language-computation boundary per `weft-ai`. Restructured as Phase 2a / 2b / 3 path with Backlog.md substrate-swap as the leading recommendation. v1 of this doc lives in git history; the four material errors are preserved inline below as the "What v1 got wrong" section.

> **⚠️ v3 changelog (2026-06-09 — a 12-agent research round). The substrate verdict
> changed. Read this block first; everything below it is v2 history.** Evidence base:
> [`RESEARCH-tracker-migration-synthesis-2026-06.md`](./RESEARCH-tracker-migration-synthesis-2026-06.md)
> (the citation source — primary-source receipts for every claim here).
>
> **Verdict: Option C — a lean flat-YAML substrate + a `ready-walker`.** One
> `tasks-<slug>.yml` per epic/slug + a \~150 LOC `ready-walker.mjs` (deterministic
> single-level ready-walk) + a `validate-tasks.mjs` integrity linter cloning the existing
> `validate-plugin.mjs` idiom. **Zero new runtime deps** (`js-yaml` already present), no
> process, no vendor, no SQLite index in v1 (ripgrep for search).
>
> This **supersedes the v2 leading recommendation (adopt Backlog.md)** and the committed
> `SPIKE-MIG.1.md` MIXED verdict. Backlog.md is **declined**: its MCP server is _another
> daemon/vendor_ (a lateral move, not the daemon-escape that is the real driver), and it
> **cannot block on dependencies** — so it structurally cannot reproduce `bd ready`, the
> load-bearing primitive. The hone-ai amnesiac three-stage _loop_ (a competing external
> proposal) is **also declined** as an opinionated plan→approve→execute→finalize workflow
> that violates `substrate-not-opinion`; we **borrow** its `progress.txt` + `AGENTS.md`
> accretion _discipline_ and add a _fresh-context reviewer_ — take the file shape, reject
> the loop.
>
> **What v2 got wrong** (corrected, primary-sourced — see synthesis §1):
>
> 1. **The `node:sqlite` FTS5 gap is stale.** FTS5 ships since Node v24.0/v22.16 (May 2025,
>    PR nodejs/node#57621). The `openclaw#65033` citation is misapplied (it's about
>    sqlite-vec, not FTS5). → The Phase-3 "substrate verification" gate is moot.
> 2. **Don't reuse/extend `liggare`.** Private, 1-week-old, native better-sqlite3 (not WASM),
>    deleted its WASM ripgrep, no source-adapter seam → extending it is a 400–700 LOC
>    refactor of someone else's unstable private project. (The "extend liggare" idea came
>    from the external hone-ai document, not this v2 — it is **rejected outright**.)
> 3. **No SQLite index in v1.** Ripgrep over the canonical files covers keyword search; an
>    FTS5/vector index is a _triggered v2_ (>500 tasks AND real latency).
> 4. **The `ready`-walker is the core primitive**, not the index. \~150 LOC over parsed YAML
>    reproduces `bd ready`; querying / BM projection / the draft spec compose around it.
> 5. **The Constitutional Guardrail descopes** to `validate-tasks.mjs` + a PostToolUse hook
>    (anti-bit-rot integrity at `npm run check` time — honestly a snapshot, not enforcement);
>    the prompt-injection guardrail is deferred with a trigger.
>
> **The four decisions are separable** (stop fusing them): A1 amnesiac loop (independent),
> A2 flat-file substrate (the real bet), A3 index (deferred), A4 drop-beads (coupled to A2
> only by narrative). **Unit of work = wave/sprint, not feature** (the per-feature PRD
> triplet over-fits a repo whose p50 issue lifespan is 1 hour; the rare epic-scale
> initiative is modelled as epic→children). The open-core "tracker = standalone npm
> package" framing of v2 is **dropped** — Option C is in-repo `.mjs` helpers, not a separate
> package (lock-in resistance + platform proximity). _(AMENDED 2026-07-11, decision
> `vp-beads-dcl`: it is now an in-repo npm **workspace** with a `bin` — `private: true`,
> unpublished, name still gated. The lock-in-resistance test still passes, because it asks
> the right question: it is a pure reader over committed files, no daemon, no index, no
> service, and deleting it costs you a `bin`, not your data. The `.mjs`-helpers clause is
> superseded; the no-vendor-product principle is not.)_ **Rename `vp-beads`→`vp-heddle` stays
> gated at M4**, decoupled from the substrate swap.
>
> **Type model RATIFIED (2026-06-10, decision bead `vp-beads-etm`): 4 types, not 9.** The
> §"Schema — 4 types, not 9" table below is **decided current** — the one piece of the
> otherwise-historical Phase-3 architecture that carries forward. `task` / `doc` /
> `decision` / `milestone`; the six bd framings ride in `labels:`, `epic` is `task` +
> `parent:`. Externally validated (beads itself keys no agent behavior on type; working
> agent-native trackers are typeless; the exclusivity property survives the smaller enum).
> Implemented in `scripts/task-schema.mjs`. Per-type required-sections return later only as
> label-conditional _advisory warnings_ — never hard errors.
>
> **Load-bearing follow-up (2026-06):** the type-vs-decorative gap a code-reading review
> surfaced — `computeReady` originally ignored `type` entirely, so a pending `doc`/`decision`
> would have surfaced as workable — is closed: `scripts/ready-walker.mjs`'s `computeReady` now
> gates on `type === 'task'`. `doc` and `decision` remain **reserved and unexercised by real
> data** (zero live instances; no `body`/`description` field) — their content-home is left an
> open design point for first real use rather than built ahead of a consumer, per `etm`'s
> `## Affects`.
>
> **First implementation feedback (2026-07-02):** a read-only shadow dogfood
> (`scripts/migrate-from-bd.mjs`, a spike) projected this repo's real 131 bd issues into the
> 4-type YAML shape and dual-ran `ready-walker` against `bd ready`. Result: exactly one clean,
> fully-explained ready-set divergence — `vp-beads-etm` itself (correctly excluded post-fix; bd
> itself has the same type-blindness the fix closed). **Scope, stated honestly:** this validated
> the 9→4 framings-collapse and the `decision`-type gate against real data — it did **not**
> validate `doc` or `milestone`, since the live corpus has zero instances of either; those two
> remain synthetic-fixture-tested only. Full findings: local `SPIKE-etm-dogfood-findings.md`
> (gitignored scratch) + `etm`'s bd `## Affects`.

## Status

**v3 (2026-06-09): verdict reached — Option C (lean flat-YAML + ready-walker).** The v2
"spike Backlog.md" action item is **closed/superseded** (the spike ran, verdict MIXED, now
overturned — see `SPIKE-MIG.1.md` and the synthesis doc). The Phase 3 "build-our-own
standalone package" design below is **historical**: Option C is the leaner answer (in-repo
helpers, no package, no MCP). Going-forward migration work is tracked in bd epic
`vp-beads-l9i`. Everything from "## Strategic frame" down is **v2 history, retained for
provenance** — corrected by the v3 block above.

## Strategic frame

> **v3 correction:** the real driver is the **operational complexity-delta of bd-on-Dolt**
> (daemon + ports + binary DB + dual-store sync + migrations + orphan reaping — observed
> live), _not_ the memory tax or dependency-enforcement loss (both **dormant** at this
> repo's scale: 1 net-blocked issue, p50 lifespan 1 hour, `bd remember` \~90 tokens). Gas
> Town "feature creep" / "strategic incoherence" is real but **positioning, not technical
> forcing** (beads is MIT, stable). Lead the rationale with the complexity-delta; it's the
> credible plank. See synthesis §2–§3.

The tracker is being explored as part of the user's broader migration off `bd` (now at `gastownhall/beads`). Motivations:

* **bd complexity** — Dolt-backed, multi-process, working-tree binary blobs, documented concurrency-crash failure mode under parallel-agent swarms
* **bd feature creep** — the gastownhall ecosystem (Gas Town workspace manager + Gas City SDK + Wasteland federation) is expanding bd's substrate role in directions that duplicate vp-beads's own workflow choreography
* **Strategic incoherence** — vp-beads positions itself as "compete head-on with Gas Town"; depending on Gas Town's substrate while claiming to compete is incoherent at the philosophy layer
* **Architectural preference for BM-style simplicity** — markdown canonical, projections derived, no daemon, manual editability valued

The tracker must:

* Honor Basic Memory's simplicity model
* Live under the AGPL constraint BM imposes (no DB internals; markdown + MCP only)
* Follow the user's `harvmcp` + `weft-ai` prior-art templates (third instance is template-following, not novel design)
* Honor the open-core boundary: **vp-beads = skills (language layer)**; **tracker = computation layer**
* Be generic infrastructure — vp-beads is one consumer; `weft-ai` also uses bd and would benefit from migration target; tracker should not be vp-beads-specific

## Phased path

### Phase 2a — Backlog.md substrate spike (~~LEADING RECOMMENDATION~~ — SUPERSEDED v3: Backlog.md declined, see v3 block)

Spike `MrLesk/Backlog.md` (in homebrew-core, 5.6K⭐, 38 contributors, MIT, TypeScript, 75+ tool MCP server, init-wizard for Claude Code auto-config) as the bd substrate replacement.

**Why Backlog.md is a strong fit after the v1 corrections:**

| Requirement (after correction)        | Backlog.md | Notes                                                                                                                                                                                           |
| ------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Markdown-native, BM-style simplicity  | ✓          | `backlog/tasks/task-<id> - <title>.md` files                                                                                                                                                    |
| 4 item types (not 9)                  | ✓          | `task / doc / decision / milestone` — cuts at actual joints                                                                                                                                     |
| Soft validation (BM Picoschema model) | ✓          | Dynamic enum schemas from `BacklogConfig`, "did you mean X?" errors                                                                                                                             |
| No `bd remember` requirement          | ✓          | Explicit "context in task, not memory" philosophy; Claude Code's own memory mechanisms (CLAUDE.md, MEMORY.md auto-memory, BM) cover the need                                                    |
| Cross-project sync stays orthogonal   | ✓          | Backlog.md doesn't claim this surface; vp-beads's existing sibling-sync/synergy-tracker/upstream-tracker/vendor-sync continue unchanged against `SYNERGY-*.md` / `UPSTREAM-*.md` / git subtrees |
| MIT license, forkable if needed       | ✓          | vs br's non-SPDX rider, BM's AGPL+CLA                                                                                                                                                           |
| Built-in MCP server, init wizard      | ✓          | `backlog mcp start` + `backlog init` auto-configures Claude Code/Codex/Gemini                                                                                                                   |
| Working tree pollution acceptable     | ✓          | User explicitly values manual editability of files via PR review                                                                                                                                |

**Spike evaluation criteria (5):**

1. **Migration cleanness**: Can `.beads/issues.jsonl` migrate to `backlog/tasks/` losslessly enough? Reversible via export?
2. **9→4 type collapse**: Map `bug` / `feature` / `chore` / `story` / `spike` → `task` with `labels:`; `epic` → `task` with parent. Does any work unit break?
3. **Concurrency under swarm-wave**: Does Backlog.md's MCP server survive 5–10 parallel agents firing simultaneously? (Concurrency model not explicitly documented; needs empirical test.)
4. **Skill rework cost**: How substantive is the rework of vp-beads's 8 skills? Best case: text-rename of `bd ` → `backlog ` plus the type-collapse migration. Worst case: deeper refactor of `backlog-groomer` and `swarm-wave`. (`harden-memories` is a special case — it operates on the `bd remember` store, which the Memory migration below dismantles; it is dropped or repurposed, not renamed.)
5. **Threat model fit**: Backlog.md's localhost-only + token-auth posture acceptable? Note that Backlog.md has zero prompt-injection sanitization — the Constitutional Guardrail still needed as a vp-beads layer.

**Spike outcomes drive next phase:**

* **Backlog.md covers ≥85%** → Phase 2b kicks off (integrate + supplement)
* **Backlog.md covers 50–85%** → mixed adoption; layer supplements where needed; re-evaluate Phase 3 in 2–3 sprints
* **Backlog.md covers <50%** → Phase 3 build-our-own kicks off, using the blueprint below

### Phase 2b — vp-beads skills layered on Backlog.md (contingent on Phase 2a)

If Backlog.md is the substrate, vp-beads ships these supplements:

* **Constitutional Guardrail PreToolUse hook** — \~50 LOC bash + Node helper, wraps `mcp__backlog__task_*` outputs with provenance-tier + structural quarantine + injection-marker flagging + length cap. Lives in vp-beads/hooks/ + vp-beads/lib/.
* **BM-graph integration skill** — joins issue body references (`npm:foo`, `brew:bar`) against BM's `## Upstream Friction` sections; surfaces "this issue affects packages with known friction" at read time.
* **session-reflect graduation hook** — extends vp-knowledge's `session-reflect` to prompt "generalizable pattern here?" when an issue closes; promotes to `engineering/*` BM notes (mirrors upstream-tracker workflow 6).
* **Memory migration** — existing `bd remember` entries move to auto-memory or CLAUDE.md; SessionStart hook drops the `bd prime` injection. **Implementation caveat (validated 2026-06-03 against Claude Code memory docs):** auto-memory avoids bd's token tax via a **first-200-line / 25 KB truncation cap on `MEMORY.md` plus a topic-file split** — there is **no relevance-recall engine** (topic files are read on demand with the ordinary file tool, navigated from the `MEMORY.md` index; not semantically retrieved). So migrated entries must be **split into topic files with one-line pointers in `MEMORY.md`, not dumped inline** — an inline dump re-creates the per-session tax (now capped at 200 lines, which silently drops anything past it). Keep a **lean, single-sentence recovery-trigger core inline**: per MemGPT/Letta a _small_ always-in-context core is correct; abolishing the always-injected tier entirely trades the token tax for retrieval-miss risk on recovery-critical facts.
* **Skill refactor** — 7 skills update their bd shell-out call sites to backlog CLI. Most surfaces are 1:1 mappings (`bd create` → `backlog task create`); the irreversible delta is the 9→4 type collapse, handled at migration time. (The 8th skill, `harden-memories`, audits the `bd remember` store and has no backlog analog — it is dropped or repurposed by the Memory migration above, not call-site-renamed.)

Estimated effort: **\~4 sprints total** (Constitutional Guardrail + memory migration → skill refactor → BM-graph + session-reflect → cleanup). Compare \~8+ sprints for from-scratch build.

### Phase 3 — Build-our-own tracker (contingent on Backlog.md falling short)

If Backlog.md doesn't fit, build the tracker following the user's own `harvmcp` + `weft-ai` templates. Blueprint below.

---

## Phase 3 architecture — the build-our-own design

**Note on prior art:** this section is a clone of the `harvmcp` template with `weft-ai`'s open-core framing applied. The user has built this shape twice (`harvmcp`, `weft-ai`); the third instance is template-following, not novel design. Specific patterns lifted from the prior art are flagged inline.

### Triple-facade pattern _(from harvmcp)_

```
                 ┌─ cli.js  (peowly-commands dispatch)
                 ├─ mcp.js  (MCP stdio server)
lib/index.js ────┤
                 └─ skill/SKILL.md  → shells out to CLI
```

`lib/commands/*.js` = **pure POJO functions** (in → out, no I/O wrapping, no formatting). All three facades dispatch to them. This is the load-bearing invariant from harvmcp's CLAUDE.md.

### File layout — standalone npm package, NOT embedded sub-directory _(from harvmcp)_

The v1 of this doc proposed `vp-beads/tracker/` embedded sub-directory with `SessionStart` `diff + npm install` bootstrap. **That was wrong.** harvmcp's distribution model — ship as `@voxpelli/<name>` npm package with `"bin"`; user installs once globally; wire into Claude Code via standard `.mcp.json` or `claude mcp add` — is simpler, cleaner separation, no `${CLAUDE_PLUGIN_DATA}` dance.

```
<tracker-name>/                    # standalone repo, @voxpelli/<tracker-name>
├── package.json                   # "bin": { "<cli-name>": "cli.js" },
│                                  # "files": ["cli.js", "mcp.js", "lib/**/*.js", "skill/SKILL.md"]
├── cli.js                         # peowly-commands dispatch entry
├── mcp.js                         # MCP stdio server (imports lib/mcp/server.js + StdioServerTransport)
├── lib/
│   ├── index.js                   # exports — the contract every facade dispatches to
│   ├── commands/                  # pure POJO functions (input → output)
│   ├── store/                     # markdown R/W + lockfile + projection
│   ├── schema/                    # Picoschema validators
│   ├── guardrail/                 # Constitutional Guardrail middleware (~50 LOC)
│   ├── mcp/                       # MCP server + tool registration + Zod schemas
│   ├── utils/
│   └── config.js
├── skill/
│   └── SKILL.md                   # Claude Code skill that shells out to CLI
├── test/
│   ├── commands/                  # per-command spec (node --test)
│   ├── integration/
│   │   ├── in-memory.spec.js     # InMemoryTransport.createLinkedPair() MCP tests
│   │   └── stdout-pollution.spec.js
│   └── ...
├── typetests/
│   └── main.tst.ts                # tstyche type-level tests
├── README.md
├── CLAUDE.md                      # project-local guidance (harvmcp pattern)
└── eslint.config.js + tsconfig.json + .knip.jsonc + .husky/...
```

**Distribution:** `npm install -g @voxpelli/<tracker-name>`, then `claude mcp add <name> -- <cli-name> mcp` (matches harvmcp's daily-use pattern). vp-beads's `.mcp.json` (if any) references the installed binary directly. No `${CLAUDE_PLUGIN_DATA}` bootstrap, no `diff + npm install` SessionStart dance.

### Open-core boundary _(from weft-ai)_

* **vp-beads plugin** (MIT, OSS via vp-plugins marketplace) — _language_ layer: skills, prose, narration, sprint choreography, cross-project sync orchestration (`/sibling-sync`, `/synergy-tracker`, `/upstream-tracker`, `/vendor-sync`)
* **`@voxpelli/<tracker-name>` package** (MIT, OSS via npm) — _computation_ layer: CRUD, dep graph, ready-walker, schema validation, Constitutional Guardrail, atomic claim
* **MCP tool contracts are the interface**
* **Tracker never narrates** — returns structured records only (weft-ai's hard rule)
* vp-beads's skills must never _require_ the tracker — degraded path uses direct markdown file reads (weft-ai's degraded-path rule)
* Same Tailscale pattern weft-ai documents (open protocol + open client + standalone tool)

Difference from weft-ai: licensing is MIT not proprietary, matching vp-beads's OSS posture.

### Storage substrate

Markdown notes at `<config-root>/issues/<id>.md` as canonical source of truth. Optional SQLite projection at `<config-root>/.index.db` (gitignored, always rebuildable from markdown).

Three reasons over JSONL or refs/wal alternatives:

* **Manual editability** wins for human-in-the-loop debugging
* **Git-mergeability** per-file beats per-line (JSONL has frequent same-line conflicts)
* **Prompt-injection surface** per-issue is selectable + sanitizable; JSONL all-in-context is not

Default `<config-root>` = `backlog/` to align with Backlog.md convention (so migration in either direction is symmetric — if Phase 3 ships and the user later wants to evaluate Backlog.md again, the storage layouts match).

### Schema — 4 types, not 9 _(RATIFIED current — decision `vp-beads-etm`, 2026-06-10; the rest of this Phase-3 section is v2 history)_

| Type        | Required `##` sections                                      | Notes                                                                                                |
| ----------- | ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `task`      | `## Acceptance Criteria`                                    | Subsumes former `bug` / `feature` / `chore` / `story` / `spike` / `epic` via `labels:` and `parent:` |
| `doc`       | (none)                                                      | Project documentation                                                                                |
| `decision`  | `## Decision`, `## Rationale`, `## Alternatives Considered` | ADR-style                                                                                            |
| `milestone` | (none)                                                      | Structural marker, no work                                                                           |

Validation via BM `type: schema` Picoschema notes with `settings.validation: warn` (not `strict`). `vp-knowledge:schema_evolve` skill handles drift over time. **No `validation.on-create=error`** — that was bd-cruft uncritically imported in v1.

Frontmatter `source` provenance field (`user` / `agent:<name>` / `imported:bd` / `imported:backlog` / `sibling-sync` / `upstream-sync`) drives Constitutional Guardrail trust tier.

### Concurrency _(algorithm lifted from br via public README)_

* `flock` advisory `.write.lock` per project
* SQLite `BEGIN IMMEDIATE` for projection writes
* `busy_timeout=0` (deliberate — prevents thundering-herd CPU spin)
* 8-retry application-level jittered exponential backoff (`50ms × 2^attempt ± 25%`, \~12.7s total wait)

Atomic claim: O\_EXCL lockfile in `<config-root>/.locks/<issue-id>.lock` (gitignored), 10-min lease, heartbeat renew, stale-reap in SessionStart. Single-host design.

### Constitutional Guardrail — the actual differentiator

\~50 LOC Node, applies in MCP `show` / `ready` / `prime` handlers before any text reaches the agent. Grounded in Willison 2025-11-02 "Agents Rule of Two", OWASP LLM01:2025, MITRE ATLAS AML.T0051.001.

1. **Provenance tier** — `source: user` trusted; `source: imported:*` trusted-grandfathered; `source: sibling-sync | agent:* | upstream-sync` untrusted (all guards apply)
2. **Structural wrap** on untrusted — `<untrusted source="..." issue="...">...</untrusted>` delimiters with paired system-prompt rule
3. **Injection-marker flag-don't-block** — regex pass for `ignore previous instructions`, `system:`, `<|im_start|>`, `[INST]`; flag with `[INJECTION-MARKER-STRIPPED]`, log source
4. **Markdown-prompt-mimicry strip** — remove HTML-style `<system>` / `<assistant>` tags
5. **Length cap** — 8 KB per-issue in `ready` / `prime` output
6. **Lethal-trifecta interlock** — refuse untrusted content in same turn as external network I/O tools

**Only differentiator vs br / Grite / bd / beads-mcp / Backlog.md** (all "Highly vulnerable" per Drive doc §7).

This is the part of the architecture that justifies building over adopting — if Phase 2a says "Backlog.md is enough," the Constitutional Guardrail ships as a vp-beads PreToolUse hook on Backlog.md MCP. Same code, different attachment point.

### MCP surface — lean v1 _(from harvmcp "Don'ts")_

harvmcp's CLAUDE.md "Things NOT to do": _"Don't add MCP resources (`harvmcp://...`) — explicitly cut for v1."_ Applied here:

**6–7 tools, NO resources, NO sampling in v1:**

* `task_create`, `task_show`, `task_list`, `task_edit`, `task_close`, `dep_manage`, `prime`

`prime` returns memory entries in Claude Code `additionalContext` format — the SessionStart hook calls `<cli-name> prime --format claude-additional-context` and emits the JSON. Same code path as MCP `prime` tool.

Resources deferred to v2 (would mirror br's 12 surface: `<scheme>://issues/ready`, `<scheme>://issues/blocked`, etc.). MCP Tasks primitive (experimental 2025-11-25) evaluated for adoption at v2. SEP-2260 constraint: no server-initiated push; all "issue X is now ready" notifications tied to client requests.

### Sizing (revised down from v1, calibrated against harvmcp)

| Component                                               | Estimate                                    |
| ------------------------------------------------------- | ------------------------------------------- |
| `lib/commands/*.js` (7 pure functions)                  | \~700 LOC                                   |
| `lib/store/*.js` (markdown R/W + lockfile + projection) | \~500 LOC                                   |
| `lib/schema/*.js` (Picoschema validators)               | \~150 LOC                                   |
| `lib/guardrail/*.js` (Constitutional Guardrail)         | \~50 LOC                                    |
| `lib/mcp/*.js` (server + tools + Zod schemas)           | \~300 LOC                                   |
| `cli.js` (peowly-commands dispatch)                     | \~150 LOC                                   |
| `mcp.js` (transport wiring)                             | \~10 LOC                                    |
| `skill/SKILL.md`                                        | \~300 lines markdown                        |
| Tests (commands + integration)                          | \~800 LOC                                   |
| **Total greenfield**                                    | **\~2,500 LOC Node + \~300 lines markdown** |

For comparison: `harvmcp` ships in \~2,000 LOC + skill. Scope is comparable.

### Testing pattern _(from harvmcp + BM note)_

* `node --test` runner
* `InMemoryTransport.createLinkedPair()` for MCP integration tests (BM note: `engineering/testing/mcp-server-integration-testing-via-inmemorytransport`)
* MCP Inspector is **manual debugging only**, not in automated pipeline
* `tstyche` type-level tests in `typetests/`
* `type-coverage` at 98%+ threshold
* `knip` for dead-code detection
* `npm run check` runs lint + tsc + knip + type-coverage in parallel via `run-p check:*` + sequential `check-type-tests`

### Graduation roadmap (Phase 3 only)

| Milestone                                                                                   | Trigger                                                                                         |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **M1: working prototype** — code in standalone repo, npm-installable, dogfooded by vp-beads | Tracker handles the 5 Phase-2a evaluation criteria                                              |
| **M2: vp-beads migrates off bd**                                                            | Phase 2b supplementary skills work against tracker as well as they did against Backlog.md spike |
| **M3: weft-ai adopts**                                                                      | Tracker proves generic enough for the user's second bd-using project                            |
| **M4: standalone identity**                                                                 | External users beyond the user's own projects                                                   |

---

## What v1 of this doc got wrong (preserved for posterity)

The v1 design exploration had four material errors, all stemming from uncritically importing bd-specific requirements into the new design:

1. **`bd remember` as a needed feature.** Claude Code already has four memory mechanisms (user-global `~/.claude/CLAUDE.md`, project `<project>/CLAUDE.md`, MEMORY.md auto-memory with SessionStart injection, Basic Memory via MCP). `bd remember` was a fifth-tier tool-portable abstraction; vp-beads is Claude-Code-native and doesn't need it. Migration: existing `bd remember` entries move to MEMORY.md or CLAUDE.md; SessionStart hook drops the `bd prime` path.
2. **9 item types as required vocabulary.** Of bd's 9 types, only 3 are distinct _kinds_ of thing: `task` (work), `decision` (record), `milestone` (marker). The other 6 (`bug` / `feature` / `chore` / `story` / `spike` / `epic`) are _framings_ of `task` — same lifecycle, same handling, distinguishable via labels or parent relations. Backlog.md's 4-type model (`task / doc / decision / milestone`) cuts at the actual joints.
3. **Hard validation (`validation.on-create=error`).** bd's rigid model was for tool portability — agents had to know the right shape before creating. BM's Picoschema soft-validation with `schema_evolve` drift management is more aligned with the user's stated preference and matches Backlog.md's enum-with-suggestions approach.
4. **"Cross-project sync as tracker concern".** vp-beads's `/sibling-sync`, `/synergy-tracker`, `/upstream-tracker`, `/vendor-sync` operate on `SYNERGY-*.md` / `UPSTREAM-*.md` / git subtrees — orthogonal markdown files, not tracker state. The tracker only needs to coexist with these files (it does — different paths), not own them.

Plus one distribution-model error:

5. **Embedded sub-directory + `${CLAUDE_PLUGIN_DATA}` bootstrap.** v1 proposed `vp-beads/tracker/` sub-package with SessionStart `diff + npm install` install dance. The harvmcp precedent shows the better path: standalone npm package, `"bin"` in package.json, user installs once globally, wires into Claude Code via standard `.mcp.json` or `claude mcp add`. No bootstrap dance, cleaner separation, matches how `br` / `beads` / `backlog-md` distribute.

These five corrections, plus the harvmcp + weft-ai prior-art findings, collapse the from-scratch design from "novel architecture work" to "clone of well-known internal templates" — and make Backlog.md adoption substantially more attractive than v1 implied.

## Naming

The vp-beads name itself needs to change away from "beads" (since the plugin is rapidly diverging from `gastownhall/beads` as upstream and adopting "beads" in the brand name now signals downstream-dependency that's no longer true). A dedicated branding exercise covers:

* Plugin name (`vp-beads` → ?)
* Repo name (`voxpelli/claude-beads` → ?)
* Tracker name (TBD — possibly aligned with `Basis Nexus` / `Weft AI` etymology)
* File conventions (`.beads/` directory → ?)

Implementation is name-agnostic; choosing late costs nothing.

## References

* `RESEARCH-ai-issue-tracker-ultimate-solution.md` (this repo) — Drive doc archive with accuracy caveats
* `engineering/agents/basis-nexus-design-document` (Basic Memory) — sibling architectural template
* `engineering/agents/agent-issue-tracker-and-mcp-server-territory-map-2026-05` (Basic Memory) — ecosystem catalog
* `brew/brew-backlog-md` (Basic Memory) — Backlog.md audit
* `brew/brew-dicklesworthstone-tap-br` (Basic Memory) — br audit
* `engineering/testing/mcp-server-integration-testing-via-inmemorytransport` (Basic Memory) — MCP test pattern from harvmcp
* `/Users/pelle/nollfyranoll/ai/harvmcp` — prior-art MCP server template
* `/Users/pelle/yikesable/weft-ai` — prior-art MCP server with open-core boundary
* Willison, Simon. "Agents Rule of Two" (2025-11-02)
* OWASP LLM Top 10 (2025), LLM01: Prompt Injection
* MITRE ATLAS AML.T0051.001 (indirect prompt injection)
