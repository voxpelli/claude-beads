# SYNERGY-vp-routines

Tracking cross-project synergy with [vp-routines](https://github.com/voxpelli/vp-routines).

vp-routines is a sibling voxpelli repo whose visible product is `routine-architect`, a
project-level Claude Code skill for designing Claude Code Routines. That skill is **not** the
synergy surface — the shared ground is that vp-routines is also an npm-workspaces monorepo on the
same `@voxpelli/*` gate stack, and that it has **extracted the plugin/skill validation vp-beads
still carries as a monolithic in-repo script**. Relationship: `shared-tooling`.

Its `packages/` hold `@voxpelli/claude-plugin-validator` and `@voxpelli/claude-skill-validator`
(both `private: true`, `0.0.0` — **unpublished**, so any adoption here is a `file:` dependency or
vendoring, not a semver dep). Everything below was measured 2026-07-29 by reading both trees and
running both validators against shared fixtures, not inferred from docs.

## Shared Patterns

* **Same gate stack, same monorepo shape** (2026-07-29) — both are npm-workspaces monorepos whose
  root `check` drives `run-p check:*` over `@voxpelli/eslint-config`, `@voxpelli/tsconfig`,
  `@ast-grep/cli`, `remark-cli`, `npm-run-all2` and `typescript`, with ESM-only JSDoc-typed
  JavaScript. The shape is close enough that tooling decisions on either side are worth reading on
  the other. Version skew is real but small, and this row exists to keep it visible rather than to
  force a lockstep bump.
  Status: drifting · Last verified: 2026-07-29
  Note: measured skew — `npm-run-all2` `^7.0.0` here vs `^8.0.4` there; `typescript` `^6.0.3` vs
  `~6.0.2`; `@ast-grep/cli` `~0.44.1` vs `^0.44.1`; `comment-parser` `^1.4.6` vs `^1.4.7`;
  `engines.node` `^22.13.0 || >=24.0.0` vs `^22.17.0 || >=24`. None is currently breaking. The
  `@ast-grep/cli` difference is deliberate here (see the pin rationale in
  `UPSTREAM-voxpelli--ast-grep-rules.md`) and carries no risk there — verified: their
  `sgconfig.yml` lists only `.ast-grep/rules` and does **not** consume
  `@voxpelli/ast-grep-rules`, so 0.45's comment-node breakage cannot silence anything of theirs.

* **ast-grep configured the same way** (2026-07-29) — both keep a root `sgconfig.yml` pointing at
  `.ast-grep/rules` with a `testConfigs` entry for `.ast-grep/rule-tests`, and both run
  `ast-grep test` as its own `check:` key. Structure is identical; only the invocation differs (see
  Divergences).
  Status: aligned · Last verified: 2026-07-29

## Divergences

* **Three JSDoc rules: consumed as a package here, forked locally there** (2026-07-29) —
  `no-jsdoc-any-type`, `no-jsdoc-object-typedef` and `no-inline-jsdoc-import` exist on both sides.
  vp-beads consumes them from `@voxpelli/ast-grep-rules` via a `ruleDirs` entry into
  `node_modules`; vp-routines carries all three as local copies in `.ast-grep/rules/`. The same
  three rules are therefore maintained twice, and a fix on either side does not reach the other.
  Convergence path: propose-shared · Reason: the package already exists and vp-beads already
  proves the consumer path works, including that a consumer-side rule-test reaches a package rule
  (ast-grep pairs on the `id:` FIELD, wherever the rule was loaded from)

* **ast-grep invocation: bare scan here, runner script there** (2026-07-29) — `check:ast-grep` is a
  plain `ast-grep scan` here, after the wrapper, path list and file-count floor were deliberately
  dissolved (`56740fb`, on the steer "why are we special?"). vp-routines runs
  `node scripts/check-ast-grep.js` alongside `ast-grep-paths.js` and `ast-grep-severity.js`.
  Convergence path: accept-difference · Reason: vp-beads dissolved its wrapper for a reason
  specific to its own history (the runner existed to exclude an in-repo workspace that has since
  been externalised). Whether vp-routines' wrapper earns its keep is theirs to judge, not ours to
  assert

* **`run-p check:*` fail-fast here, `--continue-on-error` there** (2026-07-29) — vp-beads' root
  `check` is `run-p check:* && run-s check-workspaces`, and CLAUDE.md `## Validation` explicitly
  forbids "fixing" it into `--continue-on-error`: the gate reddens on any failure either way, so
  comprehensive reporting is a preference, not a bug. vp-routines uses
  `run-p check:* --continue-on-error`.
  Convergence path: accept-difference · Reason: a documented, deliberate choice on this side; the
  opposite preference is equally defensible

* **Plugin validation: one monolithic script here, two extracted packages there** (2026-07-29) —
  vp-beads has a 718-line `validate-plugin.mjs` with module-scope mutable error arrays, no public
  API and no test of its own beyond fixture spawns. vp-routines has `validatePlugin(dir, opts)`
  returning `{ errors, warnings, counts }`, a `customChecks` extension point, `--skill-only` mode,
  and ~30 assertions across four test files. Measured head-to-head on shared fixtures: theirs exits
  2 on a missing **relative** hook script path where ours prints "Plugin validation passed"; theirs
  guards `null` array elements that crash ours with an uncaught `TypeError`; theirs catches
  empty-string and `REPLACE_ME` manifest fields ours accepts. Both share the unvalidated-hook-event
  gap, and theirs false-positives on a **quoted** hook path (splits on whitespace without stripping
  quotes) — a bug neither side has fixed.
  Convergence path: adopt-theirs · Reason: it is better on the overlap and is `dir`-taking, which
  dissolves vp-beads' nested-`plugins/*` blind spot by invoking it per workspace
  Action: gated on `vp-beads-vgp`. Adoption is ASK-FIRST (unpublished packages ⇒ `file:` dep or
  vendoring) and is **not** a wholesale swap — five checks here have no upstream equivalent (see
  Extraction Candidates)

## Extraction Candidates

* **`check-rule-parity` — the ast-grep rule↔test pairing guard** (2026-07-29) — `ast-grep test`
  does not fail on an untested rule, it **SKIPS** it and exits 0; and it pairs a test to a rule by
  the `id:` FIELD, not the filename, so renaming only the `id:` inside a test file prints
  `Configuration not found!` and still exits 0. Both hazards apply verbatim to vp-routines, which
  runs `check:ast-grep-test` with no parity guard. Verified there: all 8 of its rules currently
  have a matching test, so the hole is **latent, not live** — which is exactly when a guard is
  cheapest to add.
  Source: `scripts/check-rule-parity.mjs` · Readiness: ready
  Effort: trivial
  Update (2026-07-29): it now ships with `scripts/check-rule-parity-fixtures.mjs`, eight planted
  violations behind a `RULE_PARITY_ROOT` override, mutation-proved against the checker itself. So
  what would be adopted is a guard plus its red-proof, not a guard on trust.
  Note: it asserts three things per rule (a test file exists, its `id:` names the rule, it has an
  `invalid:` case) and prints the local-vs-package rule split rather than trusting a written-down
  count. Caveat worth passing on: it has no test of its own here (`vp-beads-rpf`), and it shipped
  with the very defect it was written to prevent — pairing by filename while claiming `id:`.

* **The five checks the extracted validator has no equivalent for** (2026-07-29) — if vp-beads
  adopts the packages, these are what it would otherwise lose, and they are equally the things
  worth contributing back through their `customChecks` hook: the naked `workflow N (Name)`
  cross-reference audit, the `auditSilentSkips` availability-convention guard, the PRIVATE-SYNERGY
  no-commit-leak apparatus (base-registry guard + local-registry validation + `.gitignore` guard),
  and the `plugins/*`-dir-with-skills-but-no-manifest positive error. Only the last is plausibly
  general; the rest encode vp-beads conventions and would need generalising first.
  Source: `validate-plugin.mjs` · Readiness: needs-cleanup
  Effort: moderate
  Note: an earlier assumption that the `mcp__*__*` prose-vs-`allowed-tools` audit was also at risk
  was **wrong** — upstream has it, and adds a bare-builtin-tool audit vp-beads lacks.

## They Have / We Don't

* **Two extracted, tested validator packages with an extension point** (2026-07-29) —
  `@voxpelli/claude-plugin-validator` (574-line lib) and `@voxpelli/claude-skill-validator`
  (262-line lib), each with its own `check:tsc`/`knip`/`installed-check`/eslint and its own test
  suite. The `customChecks` contract — an array of `(ctx) => void` given
  `{ dir, error, warn, extractFrontmatter, readJson }`, with a throwing check captured as a
  structured error rather than crashing the run — is what makes "adopt + keep a thin local layer"
  the realistic shape rather than an all-or-nothing swap.
  Priority: consider · Effort: moderate

* **Three gates vp-beads has none of** (2026-07-29) — `check:spec` (the third-party `skill-check`
  portable spec-check), `check:installed-check` (engines/dependency-range consistency) and
  `check:knip` (dead exports). vp-beads deleted knip as dead config (`vp-beads-knr`) and never had
  the other two. Note the deliberate two-layer design their package descriptions state: a portable
  spec-check plus a CC-frontmatter-dialect check "that agentskills.io's portable spec-check cannot
  cover" — vp-beads has neither layer named as such.
  Priority: consider · Effort: trivial

* **Four validator checks, one of which is this repo's own stated obsession** (2026-07-29) — a
  phantom `subagent_type` reference check (vp-beads has the mirror-image agent→skill check but not
  this direction), an unknown-frontmatter-field typo net, a configurable `--deny` tool deny-list
  compared post-normalisation, and — the pointed one — a **"checked nothing of substance" warning**
  that the CLI escalates to a hard failure when a validated directory yields zero skills, agents
  and hooks. vp-beads has a whole CLAUDE.md taxonomy about guards that pass while inspecting
  nothing, and its own validator will print "Plugin validation passed" over an empty directory.
  Priority: adopt-soon · Effort: trivial
