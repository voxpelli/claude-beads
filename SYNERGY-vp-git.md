# SYNERGY-vp-git

Tracking cross-project synergy with [vp-git](https://github.com/voxpelli/claude-git).

**Architectural relationship:** vp-beads is sprint orchestration (3 hooks, 1
agent, 8 skills). vp-git is a focused git-safety plugin (0 hooks, 0 agents,
3 skills — `rebase-validate`, `stack-cascade`, `tag-audit`; counts re-verified
2026-07-10). The two plugins are _tooling-overlapping but domain-disjoint_ —
they share plugin-scaffolding infrastructure (manifests, validators, check
orchestrator) but their feature surfaces don't intersect. vp-git is small
by feature count but architecturally **upstream for plugin scaffolding** —
it ships `check-portability.mjs`, `plugin-utils.mjs`, and a `skill-check`
spec-validation pilot that the larger consumers (vp-beads, vp-knowledge)
benefit from adopting. Drift to watch for is plugin-scaffolding shared
infrastructure; domain logic is intentionally non-overlapping.

This file is reciprocal with vp-git's `SYNERGY-vp-beads.md`. Each side
records the same shared patterns and divergences from its own POV — the act
of maintaining both halves catches drift cases a single-source record misses.

## Shared Patterns

* **Plugin scaffolding shape** (2026-05-09) — Both plugins share
  `.claude-plugin/plugin.json` manifest, `package.json` with `npm run check`
  orchestrator (`run-p check:*`), root-level `validate-plugin.mjs`, MIT
  license, `voxpelli` author, and identical remark devDeps stack
  (`remark-cli`, `remark-frontmatter`, `remark-preset-lint-consistent`,
  `remark-preset-lint-recommended`, `js-yaml`, `npm-run-all2`). The
  scaffolding shape is itself an artifact worth tracking — convergence here
  is what makes the `@voxpelli/claude-plugin-tools` extraction candidate
  viable.
  Status: aligned · Last verified: 2026-05-09
  Note (2026-06-02): the "identical remark devDeps stack" sub-claim has
  drifted — vp-beads added `remark-gfm`, `remark-validate-links`, and
  `remark-lint-unordered-list-marker-style` (plus a pinned `settings` block)
  in v0.16.0; vp-git still runs the bare two-preset config. See the "remark
  config richness" Divergence below.

* **validate-plugin.mjs tool-reference audit** (2026-05-09) — Both plugins
  maintain a root-level `validate-plugin.mjs` that audits `mcp__*__*` tool
  patterns mentioned in skill/agent prose against declared
  `allowed-tools`/`tools` frontmatter. From vp-beads's side: 435 lines
  (recent additions: workflow N (Name) convention audit, registry-schema
  validation, post-Wave-5 polish, Sprint 14 empty-name guard) vs vp-git's
  330 — 105-line gap, the largest validator drift across the three
  vp-plugins. Cross-references the matching entry in `SYNERGY-vp-knowledge.md`
  (drifting at 25-line gap on that pair) and the proposed
  `@voxpelli/claude-plugin-tools` bundle.
  Status: accept-difference (was drifting) · Last verified: 2026-07-10
  Revival trigger: shared core stable 2+ sprints AND a 3rd plugin needs a
  core-level change.
  Note: Reciprocates vp-git's entry of the same name (their POV: 330 vs
  435\).
  Note (2026-07-10, `/sibling-sync`): vp-git **reclassified this to
  `accept-difference`** on 2026-05-21, judging shared-package extraction
  _premature_ — freezing a shared API mid-divergence costs more than the
  duplication. Adopted here (`adopt-theirs`); this row previously said
  `drifting` and framed the pair as a "re-converge candidate", which the
  sibling had already argued against. Re-measured: vp-beads 617 lines vs
  vp-git 333 — a **284-line gap**, up from 105. The shared core is real but
  shrinking as a fraction; each plugin's extensions dominate. Note also that
  the per-plugin `KNOWN_MCP_PREFIXES` allowlist is accept-difference by
  design, not drift — each plugin must allowlist only the MCP servers its own
  skills use, or the audit loses its purpose.

* **`run-p check:*` parallel CI orchestration** (2026-05-09) — Both use
  `npm-run-all2`'s `run-p check:*` for parallel check execution. vp-knowledge
  diverges (sequential `&&` chaining) — already tracked in
  `SYNERGY-vp-knowledge.md`. Between vp-git and vp-beads, this is the
  matched pair; convergence on the parallel form is shared.
  Status: aligned · Last verified: 2026-05-09

## Divergences

* **Hooks/agents/skills scope** (2026-05-09) — vp-beads: 3 hooks, 1 agent,
  8 skills — sprint orchestration platform with extensive lifecycle
  surface. vp-git: 0 hooks, 0 agents, 3 skills (`rebase-validate`,
  `stack-cascade`, `tag-audit`) — focused git-safety plugin
  with minimal surface. Counts re-verified 2026-07-10 (was recorded as
  "4 hooks / 7 skills" and "1 skill" — vp-beads retired PreCompact/PostCompact
  in v0.17.0 and added `/harden-memories`; vp-git added two skills).
  Mirrors the parallel divergence in
  `SYNERGY-vp-knowledge.md` ("Hooks/agents/skills scope" between vp-beads
  and vp-knowledge), reflecting different plugin domains.
  Convergence path: accept-difference · Reason: different plugin domains
  justify different scope. Sprint orchestration legitimately needs more
  surface than focused single-skill plugins.

* **remark config richness: pinned settings, GFM, link and list-marker
  enforcement** (2026-06-02) — vp-beads (v0.16.0 lint foundation) pins
  `remarkConfig.settings` and adds `remark-gfm`, `remark-validate-links`, and
  `remark-lint-unordered-list-marker-style` (`-`), with `check:md` passing
  `--ignore-path .gitignore`. vp-git runs the bare two-preset config (consistent
  and recommended), `remark . --quiet --frail`, with no pinned settings. Same
  divergence as `SYNERGY-vp-knowledge.md` "remark config richness"; partially
  invalidates the "identical remark devDeps stack" claim in the Plugin
  scaffolding shape Shared Pattern above.
  Convergence path: propose-shared · Reason: a shared remark preset (see
  Extraction Candidates) would re-align all three vp-plugins.

## Extraction Candidates

* **check-portability.mjs portability lint** (2026-05-09) — vp-git ships a
  root-level `check-portability.mjs` (warn-only) that flags `${CLAUDE_PLUGIN_ROOT}`
  references and `../` paths that won't resolve outside Claude Code, with a
  `claude-only: true` opt-out for files that intentionally rely on the Claude
  Code runtime. vp-beads uses `${CLAUDE_PLUGIN_ROOT}` heavily across 4 hook
  scripts — direct beneficiary of adopting the lint. Co-extraction candidate
  alongside the `@voxpelli/claude-plugin-tools` bundle already tracked in
  `SYNERGY-vp-knowledge.md` "Paired bundle".
  Source: vp-git's `check-portability.mjs` · Readiness: ready (copy-on-demand) · Effort: trivial
  Note (2026-07-10, `/sibling-sync`): vp-git pins the convergence path as
  **copy-on-demand, not an npm package** (validated 2026-05-21) — a 106-line
  self-contained file with no shared state; publishing a dependency for a single
  consumer fails platform-proximity. When vp-beads wants it, copy the file or
  git-subtree it. Adopted here; this row previously implied co-extraction into
  the `@voxpelli/claude-plugin-tools` bundle.

* **plugin-utils.mjs shared utility module** (2026-05-09) — vp-git extracted
  `ROOT`, `formatError`, `formatWarn`, `extractFrontmatter` into a separate
  `plugin-utils.mjs` module consumed by both `validate-plugin.mjs` and
  `check-portability.mjs`. vp-beads's 435-line validator has the same
  helper-function patterns inline (no extracted module). Adopting the
  extraction reduces three independent re-implementations of the same
  helpers (vp-git, vp-beads, vp-knowledge) to one shared package across
  the vp-plugins marketplace. **vp-git is the de-facto reference
  implementation** for the `@voxpelli/claude-plugin-tools` bundle — they
  did the local-extraction work first.
  Source: vp-git's `plugin-utils.mjs` · Readiness: refuted (accept-difference)
  Revival trigger: a 2nd plugin needs the helpers AND the shared surface exceeds
  \~50 stable lines — even then prefer copy/subtree over a published dependency.
  Note (2026-07-10, `/sibling-sync`): vp-git **refuted this as premature**
  (validated 2026-05-21). Two corrections to the claim above: the module exports
  `ROOT`, `formatLocation`, `extractFrontmatter` (NOT `formatError`/`formatWarn`
  — those collapsed into `formatLocation`), and the shared surface is only \~18
  lines of platform-native boilerplate that exists **only** in vp-git — so this
  is greenfield adoption, not de-duplication of three re-implementations. A
  versioned 3-repo npm dependency for \~18 lines violates
  simplicity-over-correctness and the ASK-FIRST dependency gate.

* **Shared `@voxpelli/remark-config` preset** (2026-06-02) — vp-beads's
  `remarkConfig` (pinned `settings` plus `remark-gfm`, `remark-validate-links`,
  two-preset, and `remark-lint-unordered-list-marker-style` stack) is a reusable
  lint+format contract all three vp-plugins could consume, re-aligning the
  remark drift (see Divergences) and making `remark -o` autofix identical across
  the marketplace. Natural co-extraction with the `@voxpelli/claude-plugin-tools`
  bundle that vp-git's `plugin-utils.mjs` already seeds.
  Source: vp-beads `package.json` `remarkConfig` · Readiness: needs-cleanup · Effort: moderate

## They Have / We Don't

_No entries yet._
