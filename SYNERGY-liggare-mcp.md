# SYNERGY-liggare-mcp

Tracking cross-project synergy with [liggare-mcp](https://github.com/voxpelli/liggare-mcp).

liggare-mcp is a sibling voxpelli repo (a local-first MCP server over expiring `TODO`/`FIXME`/`XXX`
code-comment markers). It shares no runtime code with vp-beads, but both are neostandard/ESM Node
projects built on `@voxpelli/eslint-config`, so **dev tooling** flows between them. Relationship:
`shared-tooling`.

## Shared Patterns

* **`jsdoc-single-line-tag-description` ESLint local rule** (2026-07-21) — a JSDoc tag description
  (`@param`/`@returns`/`@property`/…) must stay on ONE physical comment line, capped at 100 chars.
  Authored in liggare-mcp (`eslint-local-rules/jsdoc-single-line-tag-description.js`, built on
  `comment-parser`); adopted here into `eslint-local-rules/` and wired as
  `local/jsdoc-single-line-tag-description: 'warn'`. No published eslint-plugin-jsdoc rule enforces
  per-tag single-line — the closest (upstream gajus/eslint-plugin-jsdoc#1158) is whole-block
  granularity. The two copies are a knowing COPY, not a share (`@voxpelli/eslint-config` does not yet
  ship it, and there is no config inheritance) — they must stay aligned by hand until extracted.
  Status: aligned · Last verified: 2026-07-21

## Divergences

* **Severity** (2026-07-21) — both wire the rule at `'warn'`, but for different reasons: liggare-mcp
  runs it as an accepted advisory; vp-beads' `eslint` has no `--max-warnings 0` (tracked as
  `vp-beads-wrn`), so `'warn'` is the only non-breaking option here regardless. If vp-beads ever adds
  `--max-warnings 0`, revisit whether this rule should stay `'warn'` or graduate to `'error'`.
  Convergence path: accept-difference

## Extraction Candidates

* **Extract `jsdoc-single-line-tag-description` into `@voxpelli/eslint-config`** (2026-07-21) — the
  rule now lives as duplicated copies in two voxpelli repos (liggare-mcp + vp-beads), each also
  carrying its own `comment-parser` devDep. It is a general-purpose lint rule with zero
  project-specifics, and both repos already depend on `@voxpelli/eslint-config` — its natural home.
  Shipping it there would delete both local copies and both `comment-parser` devDeps, and give every
  downstream consumer the rule for free. liggare-mcp is the author, so it likely leads the extraction.
  Source: `eslint-local-rules/jsdoc-single-line-tag-description.js` · Readiness: ready · Effort: small

## They Have / We Don't

* **`liggare` MCP server + the expiring-marker ledger** (2026-07-21) — liggare-mcp's core product (a
  local SQLite + FTS5/vector index over due-dated `TODO`/`FIXME` markers, queried via MCP) has no
  analogue here and no obvious fit; noted for completeness, not as an adoption candidate.
  Priority: n/a
