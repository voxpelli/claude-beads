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
  Note: v0.10.1 converged jq error handling, PLUGIN\_ROOT guard, and `scripts/*.sh`
  path matching from vp-knowledge.

- **wc -l portability guard (|| count=0 + tr -d ' ')** (2026-03-28) — Both plugins guard
  `wc -l` pipelines against failure with `|| count=0` and strip leading whitespace with
  `tr -d ' '` (macOS `wc -l` pads with spaces).
  Status: aligned · Last verified: 2026-03-28

- **edit\_note append-with-section gotcha: independently documented by both plugins**
  (2026-03-28) — Both encountered the `edit_note` + `append` + `section` EOF bug
  independently and wrote explicit warnings into reference files.
  Status: aligned · Last verified: 2026-03-28

- **check-hooks.mjs hook integration test suite** (2026-04-04) — Both plugins maintain
  `scripts/check-hooks.mjs` with shared core infrastructure: `parseJsonObjects()`
  with `}\s*{` multi-object detection, `runHook()` via `spawnSync`, jq preflight.
  Status: drifting · Last verified: 2026-05-04
  Note: Reciprocation pass on 2026-05-04 measured an \~80-line gap (vp-beads 284
  vs vp-knowledge 366). vp-knowledge added shfmt drift + clean-file paths
  (Sprint 18) and gh-ecosystem hook coverage (v0.29.0). Strong extraction
  candidate for shared `@voxpelli/claude-plugin-tools`.

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

- **ESLint via @voxpelli/eslint-config (neostandard)** (2026-06-03) — Both
  plugins lint their `.mjs` validation tooling with the `voxpelli()` factory
  from `@voxpelli/eslint-config`, using the same knobs: `noMocha: true` (both
  use a hand-rolled `test()` harness, not Mocha), `semi: false`, and `cliFiles`
  (relax `no-process-exit`/`no-console`/sync-I/O for CLI scripts). Both adopted
  it the same day (2026-06-03) and wire `check:lint` into `run-p check:*`.
  Status: aligned · Last verified: 2026-06-03
  Note: one deliberate divergence — vp-knowledge has a `lib/`, so its `cliFiles`
  keeps `lib/` library-strict and it disables `unicorn/no-null` for its NDJSON
  wire format; vp-beads has no `lib/` (every `.mjs` is a CLI tool) and instead
  *fixed* its `null`s to `undefined` (internal sentinels, not JSON emission), so
  it does not disable `no-null`. Both disable `unicorn/import-style` (uniform
  named node-builtin imports) and `security/detect-non-literal-{fs-filename,regexp}`
  (self-file validation tooling). Distinct from the `@voxpelli/remark-config`
  candidate below: eslint config is *already* a shared external preset both
  consume, so it is a Shared Pattern, not an extraction candidate. Reciprocal
  not yet filed on vp-knowledge's `SYNERGY-vp-beads.md` (it adopted at 15:36
  the same day) — surface it via `/sibling-sync`.

## Divergences

- **PreCompact hook retired** (2026-05-04) — *(Converged 2026-06-02, vp-beads
  v0.17.0)* Both plugins previously had a PreCompact command hook (independently
  converted from `prompt` to `command`). vp-knowledge retired theirs in v0.28.0
  (commit `624e3df`); vp-beads retired its PreCompact **and** PostCompact in
  v0.17.0. Both sides are now PreCompact-free.
  Convergence path: adopt-theirs · Status: converged

- **Compaction-capture hook slot — shared finding (for siblings)** (2026-06-02) —
  Verified against the live Claude Code hooks docs
  (`https://code.claude.com/docs/en/hooks`): **PreCompact** `additionalContext`
  goes to the non-agentic summarizer (dead letter), and **PostCompact** is
  observability-only ("stderr-to-user-only" — cannot inject). The **only**
  post-compaction slot that injects context into the resumed, tool-capable agent
  is **`SessionStart` with `source:"compact"`**. This corrects the prior shared
  belief (and the BM note `engineering/tooling/claude-code-plugin-mechanics`,
  which still asserts "PostCompact is the structurally correct slot") that
  PostCompact subsumes PreCompact's capture role. Any sibling relying on a
  PostCompact hook for context injection should move it to `SessionStart`
  `source=compact`. vp-beads applied this in v0.17.0 (`session-start.sh` compact
  branch). **Correction (2026-06-03):** an earlier version of this entry claimed
  vp-knowledge was "unaffected (uses `/session-reflect`, PostToolUse-driven)" —
  that was wrong. `vp-claude/hooks/hooks.json` still registers a live
  **`PostCompact`** hook (`hooks/post-compact.sh`) that emits `additionalContext`
  for knowledge-graph recovery; the script even comments "Claude Code reads only
  the first on stdout. Adopted from vp-beads' PostCompact recovery pattern (bd
  vp-claude-1oah)." Per the verified docs that `additionalContext` is dropped, so
  vp-knowledge's post-compaction graph-recovery payload is a **dead letter** on
  every compaction. vp-knowledge **is** affected and should migrate the
  `post-compact.sh` recovery payload into a `SessionStart` `source=compact` branch
  exactly as vp-beads did in v0.17.0. **Reciprocated & converged (2026-06-03,
  /sibling-sync pass):** vp-knowledge migrated its `post-compact.sh` recovery
  payload into `session-start.sh`'s `source=compact` branch and removed the
  PostCompact hook (6→5), tracked as bd `vp-claude-1oah`; its
  `SYNERGY-vp-beads.md` now records the reciprocal "PostCompact hook is a dead
  letter for context injection" as `adopt-theirs · converged`. Both sides are
  now PostCompact-free for context injection.
  Convergence path: adopt-theirs · Status: converged · Last verified: 2026-06-03

- **PostToolUseFailure hook type** (2026-03-28) — *(Resolved 2026-04-04, v0.10.0)*
  Both plugins now use command hooks with stdin JSON parsing.
  Convergence path: adopt-theirs · Status: converged

- **npm-run-all2 parallel check stages** (2026-05-29) — *(Converged 2026-05-29)*
  vp-claude adopted `npm-run-all2@^7.0.0` + `run-p check:*`, matching vp-beads
  and vp-git. Status: converged · Last verified: 2026-05-29
  Note: Reciprocated from vp-claude's `SYNERGY-vp-beads.md` entry. Sprint 19's
  pass falsely claimed convergence; finally real on 2026-05-29.
  Discrepancies found on verification: vp-claude has **6** sub-checks (adds
  `check:contract` and `check:distance` beyond vp-beads's 4), and `check:md`
  lacks `--ignore-path .gitignore`. The `run-p check:*` *pattern* converged;
  the sub-check sets are not identical. Not documented in vp-claude CHANGELOG.

- **PostToolUse BM write-validation hook** (2026-03-28) — *(Resolved 2026-04-05,
  v0.10.1)* vp-knowledge provides `post-bm-write-validate.sh`; vp-beads relies on
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
  Note: Distinct from the three-tier *memory capture* hierarchy
  (`engineering/agents/three-memory-systems-taxonomy-and-graduation`).

- **PreToolUse hook** (2026-04-05) — vp-knowledge has `pre-bash-no-python.sh`
  (prevents Python scripts in Bash); vp-beads has no PreToolUse hooks.
  Convergence path: accept-difference · Reason: Python prevention is
  vp-knowledge-specific (protects BM notes from script-based writes)

- **PostToolUseFailure matcher scope** (2026-04-05) — vp-beads matches 7 BM tools
  (write, edit, read, search, schema\_validate, schema\_diff, schema\_infer);
  vp-knowledge matches 5 (write, edit, schema\_validate, schema\_diff, schema\_infer).
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

- **remark config richness: pinned settings, GFM, link and list-marker
  enforcement** (2026-06-02) — vp-beads (v0.16.0 lint foundation) pins
  `remarkConfig.settings` (bullet `-`, emphasis/strong `*`, rule `-`, fenced,
  one-space list indent) and adds `remark-gfm` (activates the GFM
  table-cell-padding and checkbox rules), `remark-validate-links`, and
  `remark-lint-unordered-list-marker-style` (`-`);
  its `check:md` also passes `--ignore-path .gitignore`. vp-knowledge runs the
  bare two-preset config (consistent and recommended) with no pinned settings
  and no `--ignore-path`. The pinned settings are what make `remark -o` a safe
  autofixer (BM gotcha: lint rules and stringify settings must be
  hand-synchronized).
  Convergence path: propose-shared · Status: partially converged · Last verified: 2026-06-03 · Reason: extract a shared remark preset (see
  Extraction Candidates) rather than hand-syncing three partial configs.
  Note (2026-06-03, reciprocated from vp-claude `SYNERGY-vp-beads.md`): vp-claude
  (bd `vp-claude-veqf`) adopted the pinned `settings` block plus
  `remark-validate-links` and `remark-lint-unordered-list-marker-style` (`-`). Two
  accept-difference carve-outs remain: `remark-gfm` (424 table-cell-padding warnings
  on vp-claude's compact tables) and `--ignore-path .gitignore` (overrides rather
  than stacks with vp-claude's `.remarkignore`). Pinned-settings plus two-plugin
  core is the converged surface; full convergence rides the `@voxpelli/remark-config`
  extraction candidate.

- **Private SYNERGY overlay: `.local.md` suffix vs `PRIVATE-SYNERGY-` prefix**
  (2026-06-03) — Both plugins protect proprietary↔public synergy content from
  bilateral comparison and BM promotion, but via different file conventions.
  vp-claude uses a `SYNERGY-<name>.local.md` file pointed to by the registry
  `file:` field, gitignored via `SYNERGY-*.local.md` (in use for a proprietary
  open-core-partner sibling). vp-beads v0.17.0 shipped a first-class
  `PRIVATE-SYNERGY-<project>.md` overlay (a separate `PRIVATE-`-prefixed file
  alongside the shared one, gitignored, skill-aware). This shipped design
  resolves vp-claude's `UPSTREAM-vp-beads.md` `.local.md` feature request — but
  with a different shape than proposed.
  Convergence path: evaluate · Status: drifting · Last verified: 2026-06-03
  Reason: decide whether to adopt vp-beads's `PRIVATE-SYNERGY-` convention
  (migrating the gitignored `.local.md` file to a `PRIVATE-SYNERGY-` overlay) or
  keep the `.local.md` workaround. Adoption would re-converge the marketplace on
  one private-overlay mechanism. (Reciprocated from vp-claude's
  `SYNERGY-vp-beads.md` 2026-06-03 — re-verify from vp-beads's POV.)

- **Private sibling registration requires a committed entry (no local-only siblings)**
  (2026-06-03) — vp-beads's `synergy-registry.local.json` only *overrides* fields
  of an entry that already exists in the committed `synergy-registry.json`; a
  `.local.json`-only entry (name absent from the committed base) is ignored
  (`sibling-sync/SKILL.md:106-107`). So a fully-private proprietary
  (open-core-partner) sibling cannot be a recognized, sibling-syncable sibling
  without a committed entry naming it — `PRIVATE-SYNERGY-` made the *content*
  private, but *registration* (the relationship's existence) is still forced
  public. vp-claude wants local-only registration for proprietary partners.
  Convergence path: propose-shared · Status: drifting · Last verified: 2026-06-03
  Reason: filed as a feature request in vp-claude's `UPSTREAM-vp-beads.md`
  ("synergy-registry: support local-only sibling entries"). Until shipped, the
  workaround is either a committed entry (public footprint) or a hand-maintained
  `PRIVATE-SYNERGY-<sibling>.md` doc kept outside the registry machinery.
  (Reciprocated from vp-claude's `SYNERGY-vp-beads.md` 2026-06-03.)
  **Implemented (vp-beads-a2k, pending v0.18.0):** `.local.json` now **adds**
  private siblings when their `file` is `PRIVATE-SYNERGY-<name>.md` — reconciled
  to ride the existing `PRIVATE-` prefix (no new `local-only` flag), so the
  "never committed / never promoted / never reciprocated" guarantees are
  inherited as filesystem facts. A no-commit-leak invariant (private name never
  reaches a committed file) is enforced by `validate-plugin.mjs` (errors on a
  `PRIVATE-SYNERGY-*` base entry or a per-name `.gitignore` line). vp-knowledge
  may now adopt the same convention to drop its `.local.md` workaround — flip
  this to `converged` once both sides ship.

## Extraction Candidates

- **validate-plugin.mjs** (2026-03-28) — Both plugins maintain independent copies
  with \~98% overlap. A shared `@voxpelli/validate-claude-plugin` package would
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

- **Shared `@voxpelli/remark-config` preset** (2026-06-02) — vp-beads's
  `remarkConfig` (pinned `settings` plus the `remark-gfm`, `remark-validate-links`,
  two-preset, and `remark-lint-unordered-list-marker-style` plugin stack) is a
  reusable lint+format contract that vp-knowledge and vp-git could consume
  instead of each maintaining a partial copy — eliminating the config drift
  tracked in Divergences and making `remark -o` autofix behave identically
  across the vp-plugins marketplace. Natural co-extraction with the
  `@voxpelli/claude-plugin-tools` bundle (Paired bundle, above).
  Source: vp-beads `package.json` `remarkConfig` · Readiness: needs-cleanup
  Effort: moderate

## They Have / We Don't

- **knowledge-maintainer write agent with confirmation gates** (2026-03-28) —
  vp-knowledge has a dedicated agent for BM writes with structured confirmation
  gates. vp-beads performs BM writes inline within skill workflows with manual
  per-step approval in prose.
  Priority: consider �� Effort: moderate

- **Tag vocabulary standard** (2026-03-28) — vp-knowledge maintains a formal tag
  vocabulary (`[decision]`, `[lesson]`, `[gotcha]`, `[friction]`). vp-beads has
  no formal tag vocabulary: the tags were previously embedded in `precompact.sh`'s
  heredoc, but that hook was retired in v0.17.0 and the condensed `session-start.sh`
  capture nudge no longer enumerates them — so the gap is now wider, not narrower.
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

- **knowledge-ask Q\&A skill** (2026-04-05) — vp-knowledge v0.21.0 added a
  `/knowledge-ask` skill for natural-language BM queries. vp-beads has no
  equivalent — BM queries are embedded in skill workflow steps.
  Priority: low (different use case — vp-beads queries are structured, not ad-hoc)
  Effort: n/a (use vp-knowledge's directly)
