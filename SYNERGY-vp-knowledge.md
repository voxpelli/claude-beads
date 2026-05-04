# SYNERGY-vp-knowledge

Tracking cross-project synergy with [vp-knowledge](https://github.com/voxpelli/vp-claude).

**Architectural relationship:** vp-knowledge owns BM infrastructure (write
validation, schema enforcement, note quality). vp-beads builds sprint workflows
on top and relies on vp-knowledge's hooks — do not duplicate them here.

## Shared Patterns

- **validate-plugin.mjs tool-reference audit** (2026-03-28) — Both plugins maintain a
  `validate-plugin.mjs` that audits `mcp__*__*` tool patterns mentioned in skill/agent
  prose against the declared `allowed-tools` or `tools` frontmatter. Changes to either
  copy must stay in sync or the audit logic will diverge and miss different bug classes.
  Status: drifting · Last verified: 2026-05-04
  Note: v0.10.1 converged three additional checks (`agent`/`http` hook types,
  `user-invocable` boolean validation, agent `skills` phantom resolution).
  Reciprocation pass on 2026-05-04 measured a 25-line gap (vp-beads 333 vs
  vp-knowledge 358) — vp-knowledge has added the gardener read-only invariant
  and `KNOWN_MCP_PREFIXES` allowlist since. Re-converge candidate.

- **post-file-edit.sh shfmt auto-format** (2026-03-28) — Both plugins use a PostToolUse
  command hook (matcher: `Edit|Write`) that runs `shfmt -w` on edited shell scripts.
  Status: aligned · Last verified: 2026-04-05
  Note: v0.10.1 converged jq error handling, PLUGIN_ROOT guard, and `scripts/*.sh`
  path matching from vp-knowledge.

- **wc -l portability guard (|| count=0 + tr -d ' ')** (2026-03-28) — Both plugins guard
  `wc -l` pipelines against failure with `|| count=0` and strip leading whitespace with
  `tr -d ' '` (macOS `wc -l` pads with spaces).
  Status: aligned · Last verified: 2026-03-28

- **edit_note append-with-section gotcha: independently documented by both plugins**
  (2026-03-28) — Both encountered the `edit_note` + `append` + `section` EOF bug
  independently and wrote explicit warnings into reference files.
  Status: aligned · Last verified: 2026-03-28

- **check-hooks.mjs hook integration test suite** (2026-04-04) — Both plugins maintain
  `scripts/check-hooks.mjs` with shared core infrastructure: `parseJsonObjects()`
  with `}\s*{` multi-object detection, `runHook()` via `spawnSync`, jq preflight.
  Status: drifting · Last verified: 2026-05-04
  Note: Reciprocation pass on 2026-05-04 measured an ~80-line gap (vp-beads 284
  vs vp-knowledge 366). vp-knowledge added shfmt drift + clean-file paths
  (Sprint 18) and gh-ecosystem hook coverage (v0.29.0). Strong extraction
  candidate for shared `@voxpelli/claude-plugin-tools`.

- **npm-run-all2 parallel check stages** (2026-04-04) — vp-beads uses `run-p check:*`
  for parallel CI execution; vp-knowledge still uses sequential `&&` chaining
  (re-verified 2026-05-04: their `package.json` "check" script reads
  `npm run check:plugin && npm run check:md && npm run check:sh && npm run check:hooks`).
  Status: diverging · Last verified: 2026-05-04
  Note: vp-knowledge's `SYNERGY-vp-beads.md` claimed (2026-05-04) that they
  had converged — premise was wrong on inspection. Row left as diverging
  pending actual convergence on their side.

- **BM error classification hook** (2026-04-05) — Both plugins have a
  PostToolUseFailure command hook for BM tools that classifies errors into
  categories (`[server-unavailable]`, `[note-not-found]`, `[invalid-argument]`,
  `[permission-error]`, `[unknown-error]`) and emits recovery guidance.
  Status: aligned · Last verified: 2026-04-05

- **Single-JSON output contract** (2026-04-05) — Both plugins enforce that every
  hook script emits at most one JSON object on stdout. Claude Code reads only the
  first object; multi-object emission silently drops data. Both test suites verify
  this contract.
  Status: aligned · Last verified: 2026-04-05

- **jq preflight in check-hooks.mjs** (2026-04-05) — Both test suites check for
  `jq` availability before running hook tests, since several hooks depend on it.
  Status: aligned · Last verified: 2026-04-05

## Divergences

- **PreCompact hook retired in vp-knowledge v0.28.0** (2026-05-04) — Both plugins
  previously had a PreCompact command hook (independently converted from `prompt`
  to `command` type, which was the original shared pattern). vp-knowledge retired
  theirs in v0.28.0 (commit `624e3df`, 2026-04-29) per their Sprint 18 hook audit,
  judged redundant with PostToolUse-driven session-reflect propagation. vp-beads
  keeps PreCompact for sprint-reflect-before-cliff semantics — sprint-cycle-specific
  reflection has no equivalent on vp-knowledge's side.
  Convergence path: accept-difference · Reason: different time-scales (sprint
  cycle vs on-demand `/session-reflect`) call for different optimal hook surfaces.

- **PostToolUseFailure hook type** (2026-03-28) — _(Resolved 2026-04-04, v0.10.0)_
  Both plugins now use command hooks with stdin JSON parsing.
  Convergence path: adopt-theirs · Status: converged

- **PostToolUse BM write-validation hook** (2026-03-28) — _(Resolved 2026-04-05,
  v0.10.1)_ vp-knowledge provides `post-bm-write-validate.sh`; vp-beads relies on
  it via the layered plugin dependency rather than duplicating. Decision: do not
  duplicate hooks that vp-knowledge already provides.
  Convergence path: delegate-to-theirs · Status: resolved (by design)

- **Agent count and model selection** (2026-03-28) — vp-knowledge has three agents
  (knowledge-gardener, knowledge-maintainer, knowledge-primer); vp-beads has one
  (sprint-review). vp-knowledge's gardener specifies `model: sonnet` explicitly;
  vp-beads sprint-review uses `model: inherit`. Both approaches are deliberate.
  Convergence path: accept-difference · Reason: different task profiles justify
  different model strategies

- **Skill invocation layering: three levels vs two levels** (2026-03-28) — vp-beads
  uses three-level invocation (SessionStart hook → user invokes skill → agent as
  read-only gate). vp-knowledge uses two-level (hints + skills, agents as workers).
  Convergence path: accept-difference · Reason: vp-beads sprint lifecycle justifies
  the extra agent layer
  Note: Distinct from the three-tier _memory capture_ hierarchy
  (`engineering/agents/three-memory-systems-taxonomy-and-graduation`).

- **PreToolUse hook** (2026-04-05) — vp-knowledge has `pre-bash-no-python.sh`
  (prevents Python scripts in Bash); vp-beads has no PreToolUse hooks.
  Convergence path: accept-difference · Reason: Python prevention is
  vp-knowledge-specific (protects BM notes from script-based writes)

- **PostToolUseFailure matcher scope** (2026-04-05) — vp-beads matches 7 BM tools
  (write, edit, read, search, schema_validate, schema_diff, schema_infer);
  vp-knowledge matches 5 (write, edit, schema_validate, schema_diff, schema_infer).
  vp-beads covers more tools because it uses read/search more heavily in skills.
  Convergence path: accept-difference · Reason: different tool usage profiles

- **Hook type vocabulary** (2026-04-05) — v0.10.1 converged: both validators now
  accept `command`, `prompt`, `agent`, `http`. Previously vp-beads only accepted
  `command`/`prompt`.
  Convergence path: adopt-theirs · Status: converged

- **Frontmatter features** (2026-04-05) — vp-knowledge v0.21.0 uses `skills`
  (agent preloading), `user-invocable: false` (reference-only skills), and `effort`
  in agent/skill frontmatter. vp-beads v0.10.1 validates these fields but does not
  use them yet (no non-invocable skills, no agent skill preloading).
  Convergence path: evaluate · Reason: adopt when vp-beads has a use case

## Extraction Candidates

- **validate-plugin.mjs** (2026-03-28) — Both plugins maintain independent copies
  with ~98% overlap. A shared `@voxpelli/validate-claude-plugin` package would
  eliminate duplication. After v0.10.1 convergence, the remaining differences are
  plugin-specific: gardener read-only invariant (vp-knowledge), hook count in
  description string.
  Source: validate-plugin.mjs · Readiness: needs-cleanup
  Effort: moderate

- **wc -l portability guard pattern** (2026-03-28) — Safe integer counting in
  shell hooks. Non-obvious, easy to get wrong, needed by any Claude plugin.
  Source: hooks/session-start.sh · Readiness: ready
  Effort: trivial

- **Paired bundle: `@voxpelli/claude-plugin-tools` shared package** (2026-05-04) —
  Cross-reference candidate linking the two preceding entries with
  `scripts/check-hooks.mjs` (Shared Patterns, drifting) and any future plugin's
  scaffolding artifacts (e.g., vp-git's `plugin-utils.mjs`). All would benefit
  from being maintained in one place — co-extraction amortizes package-creation
  cost across multiple artifacts and prevents future bilateral drift across the
  vp-plugins marketplace. Reciprocates vp-knowledge's `SYNERGY-vp-beads.md`
  entry of the same name.
  Source: this file + vp-knowledge's `SYNERGY-vp-beads.md` · Readiness: proof-of-concept
  Effort: significant

## They Have / We Don't

- **knowledge-maintainer write agent with confirmation gates** (2026-03-28) —
  vp-knowledge has a dedicated agent for BM writes with structured confirmation
  gates. vp-beads performs BM writes inline within skill workflows with manual
  per-step approval in prose.
  Priority: consider �� Effort: moderate

- **Tag vocabulary standard** (2026-03-28) — vp-knowledge maintains a formal tag
  vocabulary (`[decision]`, `[lesson]`, `[gotcha]`, `[friction]`). vp-beads uses
  the same tags in precompact.sh but the list is embedded in a shell heredoc.
  Priority: consider · Effort: trivial

- **Schema system (ongoing)** (2026-03-28) �� vp-knowledge uses BM schema tools
  for ongoing validation. vp-beads only uses them in retrospective trend-review.
  Priority: consider · Effort: moderate

- **vp-note-quality preloadable skill** (2026-04-05) — vp-knowledge v0.21.0
  ships a non-invocable `vp-note-quality` skill with the Note Quality Checklist
  (10-item anti-pattern prevention). Agents declare `skills: [vp-note-quality]`
  to preload it. vp-beads has no equivalent quality-gate skill.
  Priority: low (vp-beads writes fewer BM notes than vp-knowledge)
  Effort: trivial to adopt if needed

- **knowledge-ask Q&A skill** (2026-04-05) — vp-knowledge v0.21.0 added a
  `/knowledge-ask` skill for natural-language BM queries. vp-beads has no
  equivalent — BM queries are embedded in skill workflow steps.
  Priority: low (different use case — vp-beads queries are structured, not ad-hoc)
  Effort: n/a (use vp-knowledge's directly)
