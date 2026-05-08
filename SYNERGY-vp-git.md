# SYNERGY-vp-git

Tracking cross-project synergy with [vp-git](https://github.com/voxpelli/claude-git).

**Architectural relationship:** vp-beads is sprint orchestration (4 hooks, 1
agent, 7 skills). vp-git is a focused git-safety plugin (0 hooks, 0 agents,
1 skill). The two plugins are *tooling-overlapping but domain-disjoint* —
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

- **Plugin scaffolding shape** (2026-05-09) — Both plugins share
  `.claude-plugin/plugin.json` manifest, `package.json` with `npm run check`
  orchestrator (`run-p check:*`), root-level `validate-plugin.mjs`, MIT
  license, `voxpelli` author, and identical remark devDeps stack
  (`remark-cli`, `remark-frontmatter`, `remark-preset-lint-consistent`,
  `remark-preset-lint-recommended`, `js-yaml`, `npm-run-all2`). The
  scaffolding shape is itself an artifact worth tracking — convergence here
  is what makes the `@voxpelli/claude-plugin-tools` extraction candidate
  viable.
  Status: aligned · Last verified: 2026-05-09

- **validate-plugin.mjs tool-reference audit** (2026-05-09) — Both plugins
  maintain a root-level `validate-plugin.mjs` that audits `mcp__*__*` tool
  patterns mentioned in skill/agent prose against declared
  `allowed-tools`/`tools` frontmatter. From vp-beads's side: 435 lines
  (recent additions: workflow N (Name) convention audit, registry-schema
  validation, post-Wave-5 polish, Sprint 14 empty-name guard) vs vp-git's
  330 — 105-line gap, the largest validator drift across the three
  vp-plugins. Cross-references the matching entry in `SYNERGY-vp-knowledge.md`
  (drifting at 25-line gap on that pair) and the proposed
  `@voxpelli/claude-plugin-tools` bundle.
  Status: drifting · Last verified: 2026-05-09
  Note: Reciprocates vp-git's entry of the same name (their POV: 330 vs
  435).

- **`run-p check:*` parallel CI orchestration** (2026-05-09) — Both use
  `npm-run-all2`'s `run-p check:*` for parallel check execution. vp-knowledge
  diverges (sequential `&&` chaining) — already tracked in
  `SYNERGY-vp-knowledge.md`. Between vp-git and vp-beads, this is the
  matched pair; convergence on the parallel form is shared.
  Status: aligned · Last verified: 2026-05-09

## Divergences

- **Hooks/agents/skills scope** (2026-05-09) — vp-beads: 4 hooks, 1 agent,
  7 skills — sprint orchestration platform with extensive lifecycle
  surface. vp-git: 0 hooks, 0 agents, 1 skill — focused git-safety plugin
  with minimal surface. Mirrors the parallel divergence in
  `SYNERGY-vp-knowledge.md` ("Hooks/agents/skills scope" between vp-beads
  and vp-knowledge), reflecting different plugin domains.
  Convergence path: accept-difference · Reason: different plugin domains
  justify different scope. Sprint orchestration legitimately needs more
  surface than focused single-skill plugins.

## Extraction Candidates

- **check-portability.mjs portability lint** (2026-05-09) — vp-git ships a
  root-level `check-portability.mjs` (warn-only) that flags `${CLAUDE_PLUGIN_ROOT}`
  references and `../` paths that won't resolve outside Claude Code, with a
  `claude-only: true` opt-out for files that intentionally rely on the Claude
  Code runtime. vp-beads uses `${CLAUDE_PLUGIN_ROOT}` heavily across 4 hook
  scripts — direct beneficiary of adopting the lint. Co-extraction candidate
  alongside the `@voxpelli/claude-plugin-tools` bundle already tracked in
  `SYNERGY-vp-knowledge.md` "Paired bundle".
  Source: vp-git's `check-portability.mjs` · Readiness: ready · Effort: trivial

- **plugin-utils.mjs shared utility module** (2026-05-09) — vp-git extracted
  `ROOT`, `formatError`, `formatWarn`, `extractFrontmatter` into a separate
  `plugin-utils.mjs` module consumed by both `validate-plugin.mjs` and
  `check-portability.mjs`. vp-beads's 435-line validator has the same
  helper-function patterns inline (no extracted module). Adopting the
  extraction reduces three independent re-implementations of the same
  helpers (vp-git, vp-beads, vp-knowledge) to one shared package across
  the vp-plugins marketplace. **vp-git is the de-facto reference
  implementation** for the `@voxpelli/claude-plugin-tools` bundle — they
  did the local-extraction work first.
  Source: vp-git's `plugin-utils.mjs` · Readiness: ready · Effort: trivial

## They Have / We Don't

*No entries yet.*
