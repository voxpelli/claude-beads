# Agent Prior-Art Findings — Transcript Indexer Companion

Companion to the wild-and-crazy architect agent (aad7278c94d72575b). Goal: make sure the design isn't reinventing what already exists, missing a known lesson, or ignoring an obvious composition.

---

## Dimension 1: Has someone built this?

**Verdict: CLOSE BUT DIFFERS — multiple tools already index Claude Code JSONL transcripts; none match the seed design's exact privacy+composition profile, but the gap is narrower than the seed suggests.**

Closest existing tools, ranked by relevance:

1. **ccusage** — `npm:ccusage` — https://ccusage.com / https://www.npmjs.com/package/ccusage
   The big one. A mature CLI that reads `~/.claude/projects/*.jsonl` (plus Codex, OpenCode, Amp, pi-agent locations) and reports daily / session / monthly token+cost breakdowns. Has a statusline integration. Local-only, no upload. **It already does the read-and-aggregate side of the seed design — for token/cost dimensions, not tool-call dimensions.** It does NOT extract a tool-call timeline; the per-call shape (tool name × first-token × session × timestamp) is not in its output. So the seed design is complementary, not duplicative — but the architect should know that "ccusage for tool calls" is the clearest one-line elevator pitch.

2. **search-sessions** (sinzin91, HN Show, 73 days ago) — https://news.ycombinator.com/item?id=47128630 + https://github.com/sinzin91/search-sessions
   A Claude Code skill that indexes JSONL transcripts for full-text search of session content. Installs as a skill, exposes `/search-sessions` with `--deep` and `--project` flags. **Indexes content, not metadata** — the opposite privacy posture from the seed design. Validates that the "skill that wraps an index" shape works in practice.

3. **definite.app `cc-search` skill** — https://www.definite.app/blog/claude-code-search-skill
   Python script + skill wrapper that does full-text search of JSONL, outputs `claude --resume` invocations. Built because `/resume` only searches titles. ~50 LOC. Demonstrates the minimum viable shape.

4. **Reddit `ClaudeSessionIndex`** — https://www.reddit.com/r/ClaudeCode/comments/1qu6mhq/ — "~3000 sessions, no way to search them. Built a tool that indexes everything into SQLite with full-text search."

5. **claude-mem** — https://docs.claude-mem.ai/architecture/database
   SQLite + FTS5, schema has `session_id`, `tool_name`, `project`, `created_at_epoch`, `files_read`, `files_modified`. **This is the closest schematic match to the seed design** — but it captures observations (narrative, facts, concepts, text) not just metadata-rows. Worth reading their schema before finalizing the TSV columns.

6. **daaain/claude-code-log** — https://github.com/daaain/claude-code-log
   Python CLI that converts JSONL to HTML/Markdown. Pydantic schema models for `TranscriptEntry` (User/Assistant/System/Summary/QueueOperation). Uses a SQLite cache for incremental re-parses. **Confirms the JSONL schema and the "line-by-line incremental parse + cache" shape is industry standard.**

7. **memsearch (zilliz) plugins/claude-code** — https://github.com/zilliztech/memsearch — adds Claude Code as a plugin; "real-time watch indexing." Vector DB-backed.

8. **Maciek-roboblog/Claude-Code-Usage-Monitor** — reads `~/.claude/projects/*.jsonl` continuously, P90/burn-rate. Token-focused.

9. **Real-time observability dashboards** — `simple10/agents-observe`, `disler/claude-code-hooks-multi-agent-observability`, doneyli's substack tool (localhost:3050). All use **the hook-based event stream** (PreToolUse/PostToolUse/Stop), NOT JSONL parsing. Two-sourcing the same data. WebSocket push to a React dashboard.

10. **Anthropic-blessed observability path** — https://code.claude.com/docs/en/monitoring-usage
    Claude Code emits **OpenTelemetry natively**: traces, metrics, logs via OTLP/Prometheus/console exporters. The `OTEL_LOG_TOOL_DETAILS=1` env var enables exactly the metadata the seed design wants (tool names, MCP server+tool names, skill names, bash commands). Datadog/OpenObserve/Coralogix/Sequins/Monad all already ingest this. **There is a sanctioned upstream tap; the seed design is effectively "OTel-without-the-OTel-tax."**

**Bottom line:** The "JSONL → index" pattern is heavily worked. The privacy-bounded, append-only-TSV, metadata-only tool-call slice is genuinely the open niche. But the architect should expect to be questioned on "why not just configure OTel + a local collector?" — that's the most defensible existing alternative.

---

## Dimension 2: Closest non-Claude-Code architectural precedent

### `atuin` — the strongest precedent (DeepWiki-verified)

**What to copy:**
- **Local-first SQLite is the proven storage for "history with rich metadata."** Atuin doesn't ship flat-file because contextual metadata (CWD, exit code, duration, hostname, session, *author*, *intent*) repays a real schema.
- **The "ATUIN_HISTORY_AUTHOR" / "ATUIN_HISTORY_INTENT" env vars** — atuin already has fields for "this command was run by an AI agent" and a tag for the originating intent. **Atuin has explicit agent-aware support including hooks that tag agent-run commands** so users can filter agent noise out of interactive search. The seed design is one layer above atuin's concern, not orthogonal to it.
- **Background daemon for indexing** (`atuin-daemon`) keeps the hot path (insert) latency-free. The seed design's "lazy-eager via SessionStart hook" avoids the daemon — that's the deliberate trade-off, and it's defensible for the scale (~1M rows ≠ ~100M).
- **Exclusion filters by regex + CWD pattern + leading-space convention.** Need an equivalent so users can exclude specific projects/MCPs/sensitive bash patterns.
- **Optional end-to-end encrypted sync** as a future-extension hook, not v1. PASETO V4 Local + envelope encryption. Don't build v1 for sync, but pick storage that doesn't preclude it.

**What to avoid:**
- **Heavy crate-split architecture** (atuin / atuin-client / atuin-daemon / atuin-common / atuin-server) is overkill for v1. Match the seed design's "shell utility + thin MCP" until usage justifies more.
- **Shell-integration fragility** — atuin's biggest support burden is non-interactive shells, transient shell sessions, weird subshell spawns. The seed design dodges this by reading JSONL post-hoc, which is structurally simpler than the shell-hook approach. **Keep that property — don't add a PreToolUse hook to capture in real-time even if it sounds nice; you'll inherit atuin's shell-integration hell.**

### `mcfly` — secondary precedent (DeepWiki-verified)

Smaller-scope SQLite-backed history with hook-based incremental ingestion. Key lesson: **PROMPT_COMMAND / precmd_functions / fish_postexec hooks are the choke point** — they fire on every command, so they MUST be sub-millisecond. The seed design's "process at SessionStart" sidesteps this entirely. mcfly also uses a simple `cmd_tpl` (normalized template) column for ranking — analogous to the seed's `first_token + command_hash`.

### `lnav` (third precedent, not DeepWiki-verified here but well-known)

**What to copy:** the "logs are the substrate, SQL is the query surface" model. lnav opens log files and presents them as SQL tables without ETL. The seed design's TSV+awk equivalent is the same shape — substrate stays the file, the query language is whatever you bring.

### Honourable mentions

- **WakaTime / ActivityWatch** — quantified-self for editor activity. Both ship local SQLite + optional sync. Both treat the local store as authoritative and remote as a derived view. ActivityWatch is the closest in spirit: open-source, local-first, privacy-respecting, queryable. The seed design's "metadata not content" boundary matches WakaTime's heartbeat model.
- **Vector / fluent-bit** — the "watch + extract + sink" pipeline shape. **Overkill for v1**, but the architect should be able to say "we are not building a log pipeline, we are building a history index" — and a sentence in the design saying "if you ever want pipelines, use Vector and pipe TSV into it" closes the door cleanly.

---

## Dimension 3: Pelle's existing signal (Raindrop + BM + Readwise)

Top hits, ranked by signal:

1. **Local-First Software — Ink & Switch (2019)** — Raindrop 1672159246, AI-bookmarked, tag `manifesto`, `foundational-text`. **Strong signal**: Pelle has bookmarked the canonical local-first manifesto AND Cambria (1672229333). Tells you Pelle will care about: data-portability, no-cloud-required, schema-evolution-friendly storage. *Implication: TSV+offsets.json is on-thesis; SQLite is acceptable; anything cloud-dependent is off-thesis.*

2. **OpenTelemetry - Observability Standard and Its Design-by-Committee Problem** — BM `engineering/open-telemetry-observability-standard-and-its-design-by-committee-problem`. **Critical signal**: Pelle has a strong critical position on OTel. "A classic example of the failure of design by committee... no clear vision." The note explicitly endorses "use the semantic conventions (standardized field names) but ignore the wire protocols, collectors, and other infrastructure." *Implication: the architect's "why not OTel?" objection has a known answer in Pelle's own knowledge graph — borrow the field-naming conventions (`gen_ai.tool.name`, etc.) but reject the collector/exporter stack. This is a perfect substrate-vs-advisory application.*

3. **Sequins — Local Observability on your machine** — Raindrop 1648403785, tags `macos`, `opentelemetry`, `metrics`. Local-first OTel with no cloud. **Validates the local-only posture.** If Pelle ever wants the dashboard layer, Sequins is what he'd reach for — the seed design should not compete with it; emit OTel as an export option, don't replicate the UI.

4. **OpenObserve** — Raindrop 831032047, "10x easier, 140x lower storage cost, petabyte scale." Bookmarked since 2023. Suggests Pelle thinks about observability cost ratios. *Implication: ~75MB-for-1M-rows in the seed design is well within Pelle's mental cost budget; he won't push back on storage size.*

5. **Unix Philosophy — Doug McIlroy (1978)** — Raindrop 1672160178, `manifesto`, `foundational-text`. "Store data in flat text files." **Direct vote for TSV over SQLite for v1.** Combined with the substrate-vs-advisory frame, this is the doctrinal core of the seed design.

6. **Zero Framework Manifesto** — referenced in the substrate-vs-advisory BM note. Bookmarked id 831016347. Pelle's stance: prefer composing primitives. *Implication: the "shell utility + thin MCP query layer" hybrid is the right shape; a monolithic Python/Rust binary would lose Pelle.*

7. **Claude Code — hooks configuration** — Raindrop 1689709667, AI-bookmarked. Pelle has deep notes on SessionStart matcher values (`startup`/`resume`/`clear`/`compact`), additionalContext shape. **The lazy-eager SessionStart hook approach is materially supported by Pelle's existing reading.**

8. **Claude Code — statusLine configuration** — Raindrop 1689709666. Pelle knows statusline integration is a thing (ccusage uses it). *Implication: a future-extension hook for "show today's tool-call count in the statusline" should be designed-in but not built v1.*

9. **Claude Skills are awesome (Simon Willison)** — Raindrop 1672490447, `foundational-text`. Quote: "Since leaning heavily into Claude Code I've hardly used MCP at all." *Implication: Pelle's track record (vp-beads is 7 skills + 1 agent + 0 MCP servers) suggests he'll prefer the skill-only path. The "hybrid: shell utility + thin MCP" recommendation in the seed design may slide toward "skill that shells out" in practice. Reckon with that.*

10. **superpowers (obra)** — Raindrop 1672491613, AI-bookmarked. The wrapper pattern (~200-byte commands → deep skills) is Pelle's reference architecture. *Implication: the query surface should be a skill, not an MCP server, unless cross-project composition demands MCP.*

11. **Project Cambria (Ink & Switch)** — Raindrop 1672229333, `local-first`, `crdt`. **Schema evolution is a known Pelle concern.** *Implication: the TSV header must be versioned (`# v1` first-line comment or filename suffix), and the design needs a "what happens when we add a column" story.*

Notably **zero hits** for `atuin shell history` in Pelle's Raindrop — he hasn't bookmarked it. This is the strongest "the architect should explicitly cite atuin" recommendation: it's the obvious precedent Pelle hasn't yet collided with.

Readwise returned zero signal on atuin / append-only logs / event sourcing — Pelle hasn't highlighted in this domain. The thinking is original, not reading-derived.

---

## Dimension 4: Cross-domain principles to honor

1. **OpenTelemetry GenAI Semantic Conventions are the de facto field-naming standard.** Spec at https://opentelemetry.io/docs/specs/semconv/gen-ai/ — there's now a dedicated MCP semconv at https://opentelemetry.io/docs/specs/semconv/gen-ai/mcp/. Anthropic's `OTEL_LOG_TOOL_DETAILS=1` emits aligned attributes. *How to apply:* name the TSV columns to match (`gen_ai.tool.name` → `tool_name`, `gen_ai.operation.name` for the bash-vs-mcp distinction). This buys future interop with Sequins/Datadog/OpenObserve without paying the OTel infrastructure tax — exactly what Pelle's own BM note recommends. Even if you ship TSV, document the OTel mapping in the README.

2. **Local-first software principles (Ink & Switch).** Seven ideals: no spinners, work offline, multi-device sync, longevity, privacy, user ownership, network optional. *How to apply:* the seed design satisfies all seven — make this explicit in the design doc. The `~/.local/state/` path choice + TSV substrate + no required network are all local-first-ideal-aligned. **Add: a "decommissioning" story (where does the data go if you stop using Claude Code?). Local-first requires it.**

3. **Append-only + immutable logs (Pat Helland's "Immutability Changes Everything").** Not in Pelle's Readwise but it's the doctrinal ancestor of the seed's "the past doesn't change" line. *How to apply:* the TSV append is correct; the `offsets.json` is the mutable-state escape hatch. Be explicit that offsets.json is a *cache* (rebuildable from scratch by re-scanning all JSONL), not authoritative state. This makes the design loss-tolerant.

4. **Schema evolution via Cambria (Ink & Switch).** *How to apply:* the TSV needs an in-band schema version. Recommend `# v1\ttimestamp\tsession_id\t...` as line 1, and the reader skips comment lines. When `v2` adds a column, the reader does forward-only migration. The architect's design should specify this; absent a version, every consumer guesses.

5. **The "exhaust" framing (observability folk wisdom, articulated in *Distributed Systems Observability* by Cindy Sridharan).** Observability data is best when captured as a side-effect of normal operation, not as a project goal. *How to apply:* the design should READ existing JSONL exhaust — never ASK Claude Code to emit anything new. The hook-event dashboards (simple10/agents-observe et al.) violate this by adding PreToolUse hooks; the seed design's "post-hoc JSONL parse" is cleaner. Defend this property explicitly.

6. **Privacy boundary as a feature, not a limitation.** k-anonymity / differential-privacy framing isn't necessary at v1's scale, but the line "tool name + first token + session id + timestamp; NEVER content" should be promoted from a section heading to **the lead sentence of the README.** It is the design's primary differentiator vs. claude-mem, search-sessions, cc-search (which all index content).

---

## Dimension 5: Novelty audit

Per-pillar classification:

| Pillar | Verdict | Notes |
|---|---|---|
| Watch `~/.claude/projects/**/*.jsonl` with fswatch | **DUPLICATION** | Maciek-roboblog/Claude-Code-Usage-Monitor, claude-code-log, ccusage, claude-mem all do this. Standard pattern. **Recommendation:** don't defend novelty; cite prior art and move on. |
| TSV (not SQLite) for the substrate | **SYNTHESIS** | Unix philosophy + atuin's lessons inverted. atuin proved SQLite scales; you're betting at ~1M rows it doesn't have to. The novelty is the choice's *justification* (substrate-shaped, awk-queryable, Pelle's BM note on OTel says "naming conventions yes, infrastructure no"), not the format. **Recommendation:** keep TSV for v1, document the SQLite upgrade trigger (when query patterns require multi-column indexes, or when row count crosses ~10M). |
| Privacy boundary: metadata-only, never content | **NOVEL** (in the Claude Code ecosystem) | claude-mem, search-sessions, cc-search, claude-code-log, claude-mem all index content. ccusage indexes tokens (which is content-derived). **No existing tool ships the "frequency-and-shape, never substance" line for Claude Code transcripts.** This is the most defensible novelty. **Recommendation:** lead with this. |
| Lazy-eager via SessionStart hook (no daemon) | **SYNTHESIS** | The hook docs (Pelle bookmark 1689709667) describe SessionStart matchers explicitly. atuin uses a daemon; cc-search uses a script; nobody ties freshness to "next-session-start." **Recommendation:** novel-ish framing; defend with the "freshness needed exactly when query happens" argument. |
| MCP layer for query | **SYNTHESIS / borderline DUPLICATION** | Datadog MCP, claude-mem, agents-observe all expose data through MCP. Doing it on top of a TSV + Claude Code transcripts is incremental. **Recommendation:** v1 ships **skill-only** (Simon Willison + Pelle's track record); MCP layer is v2 only if cross-project composition demand materializes. Cuts scope by ~half. |
| Cross-session analyses (allowlist tuning, stale-MCP detection, denial detection) | **NOVEL** | The downstream use-cases are the design's true contribution. ccusage answers "how much"; this design answers "what shape." No prior art ships allowlist-tuning-from-history. **Recommendation:** the design should lead with use-case 1 (`/fewer-permission-prompts` becomes instant + representative), not with the storage format. |
| Aligning column names with OpenTelemetry GenAI semconv | **NOVEL (in this context)** | Pelle's BM note already endorses this strategy. **Recommendation:** explicitly say "column names mirror `gen_ai.*` semconv where applicable" in the README. Free interop with the OTel ecosystem; future export path; minimal cost. |

**Duplication pillars to lean into existing tools instead:**
- **The watcher itself**: probably should not be hand-rolled. Use `fswatch` (Pelle has BM coverage of `brew-fswatch`) or `watchexec`. Don't write a watcher loop.
- **Token/cost dashboards**: defer to `ccusage`; do not replicate.
- **Real-time dashboards**: defer to `simple10/agents-observe` / Sequins / Anthropic's OTel path; do not replicate.

---

## Synthesis for the architect

Three things the architect's design should change/keep based on this prior-art map:

1. **Reposition as "atuin for Claude Code tool-call metadata."** Adopt the framing directly. Atuin is the closest architectural sibling (history with rich metadata, local-first, exclusion filters, agent-aware fields) and Pelle has NOT bookmarked it — citing atuin is high-value. Also adopt: regex/CWD-based exclusion config (atuin's `history_filter` / `cwd_filter`), per-session author-like tags (so "agent-vs-user" filtering is possible later), and explicit "no shell-hook in the hot path" as a design property (avoid atuin's biggest support burden). The seed design's storage choice (TSV vs SQLite) can still differ — atuin uses SQLite because they need fuzzy search ranking; the seed design's queries are aggregate-shaped where awk wins.

2. **Lead with the privacy boundary, not the storage format.** Every other Claude Code transcript tool (ccusage / search-sessions / claude-mem / cc-search / agents-observe) indexes content or tokens. The seed design's "metadata only, never substance" is the genuinely novel position in the ecosystem. Promote it from section heading to the lead sentence. The TSV-vs-SQLite debate is a substrate detail; the metadata-only commitment is the actual product.

3. **Align with OpenTelemetry GenAI semantic conventions for field names; reject OpenTelemetry as infrastructure.** Pelle's own BM note `engineering/open-telemetry-observability-standard-and-its-design-by-committee-problem` makes this exact call: "use the semantic conventions (standardized field names) but ignore the wire protocols, collectors, and other infrastructure." Anthropic's `OTEL_LOG_TOOL_DETAILS=1` already emits these. So: name TSV columns `tool_name` / `gen_ai.operation.name`-aligned, document the mapping, and the design ships free interop with Sequins/Datadog/OpenObserve without paying any OTel-collector cost. This also pre-empts the "why not just configure OTel?" objection: answer is "we ARE OTel-shaped at the naming layer; we just don't make you stand up a collector to query it."

Additional smaller adjustments:
- Drop the MCP query layer from v1. Ship as a skill (`/transcript-index` or `/cc-history`) that shells out to awk/grep. Pelle's vp-beads track record and Willison's "Skills > MCP" essay (Raindrop 1672490447) both vote this way. MCP is v2 if cross-project demand emerges.
- Add a TSV schema-version header line (`# v1\t...`) for Cambria-style forward migration.
- Add explicit decommissioning instructions in the README (one rm command). Local-first principle.
- Reference, in the design doc: ccusage (token analog), atuin (architectural sibling), Sequins (local OTel dashboard for the "if you want a UI" path), claude-mem (the content-indexing alternative to compare against).

---

## Open questions surfaced

1. **Does Anthropic's `OTEL_LOG_TOOL_DETAILS=1` emit the same data as the JSONL transcripts, or strictly less?** If equivalent, the seed design is arguably redundant with "configure OTel + local collector." If less (e.g., MCP tool inputs absent from OTel but present in JSONL), that's the architectural moat. The GitHub bug report at anthropics/claude-code#17046 ("OpenTelemetry logs MCP tools as generic 'mcp_tool' instead of the specific tool name") suggests JSONL is strictly richer for MCP-tool naming today. Worth confirming.

2. **What's the realistic JSONL schema-stability story?** Anthropic has shipped breaking changes before (sessions-index.json issues #22462, #29778, #36027). If the JSONL line format changes shape, every downstream tool breaks. Is there an Anthropic commitment to JSONL stability? (Probably not — but worth asking. If unstable, the design needs a "schema-detection + skip-unknown" parser.)

3. **Does `claude-mem`'s schema (https://docs.claude-mem.ai/architecture/database) suggest fields the seed design is missing?** Their schema has `correlation_id`, `prompt_number`, `files_read`, `files_modified` — all metadata-shaped. None violate the "no content" boundary. Worth a 10-min read of their schema before finalizing.

4. **Should the design build on top of ccusage's parser, or reimplement?** ccusage already parses JSONL idiomatically for token data. Wrapping or extending it (vs. duplicating the parse logic) is a real composition decision. Not investigated here — depends on ccusage's API surface.

5. **Is there a "Claude Code emits OTLP locally to a file" mode** that would let the design skip JSONL parsing entirely and consume OTLP-JSON? OTLP-file exporter exists; whether Claude Code's bundled OTel SDK supports it without an external collector is unknown without testing. If yes, the design simplifies considerably.
