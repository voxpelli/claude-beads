---
id: vp-beads-gow
title: Gate ownership — the root owns AUDIT-class gates; a workspace owns lint/test/type
status: completed
type: decision
priority: high
updated: '2026-08-04'
---

## Decision

**Retire _"THE WORKSPACE OWNS ITS GATES"_ as a universal claim. Split it by gate class:**

> **The root owns DISCOVERY/AUDIT gates. A workspace owns its LINT, TEST and TYPE gates.**

* **Root-owned (audit):** `validate-plugin.mjs` (frontmatter, `allowed-tools`, the `mcp__*`
  tool-reference audit, the naked `workflow N (Name)` audit, registry validation, the
  PRIVATE-SYNERGY no-commit-leak guards) and `check-prose-commands.mjs`. These **discover**
  `plugins/*` content by design and are supposed to.
* **Workspace-owned (lint/test/type):** `check:md`, `check:sh`, `check:lint`, `check:tsc`,
  `check:type-coverage`, `check:test`. A workspace that wants one creates it; the root
  delegates via `npm run check --workspaces --if-present`.

Two consequences follow immediately, and both are the point of writing this down:

* The root `eslint.config.js` `cliFiles` entry naming `plugins/diarie-adopt/scripts/**/*.mjs`
  is a **lint** reach-in and must be **retracted**, exactly as the `diarie/**` retraction
  already documented in that file. `diarie-adopt` gets its own `eslint.config.js`.
* `plugins/diarie-adopt` getting its own `tsconfig.json` + `check:tsc` is **not** a violation
  of anything — type checking is workspace-owned. (It must `extends`
  `@voxpelli/tsconfig/node22.json`; a hand-rolled `"strict": true` reports 77 errors instead
  of 98, silently dropping every `TS4111` because `noPropertyAccessFromIndexSignature` is
  set by the shared base, not implied by `--strict`.)

## Rationale

The repo has been holding **two incompatible invariants at once**, and each fix made under one
of them strengthened a principle the other violates.

_"The workspace owns its gates"_ was used to justify removing `plugins/**` from the root
`tsconfig.json` (`9a76fe9`) and is the stated basis of `vp-beads-wsx`'s eslint fix.
_"The root discovers plugin content"_ was used to justify `validate-plugin.mjs` and
`check-prose-commands.mjs` reaching into `plugins/*` (`vp-beads-gtd`: _"convert
validate-plugin / prose-commands / check-hooks to plugin-DISCOVERY"_).

Measured 2026-08-04, all four `plugins/*/package.json`: `ledger` and `swarm-wave` are
`remark skills/ --quiet --frail` and **nothing else**; `diarie-adopt` adds the probe suite;
`vp-dream` adds sh + one bash test. **No workspace runs any frontmatter, `allowed-tools`,
tool-reference, or `workflow N (Name)` audit.** All of it is in the root — which CLAUDE.md
itself calls the thing that _"catches the most common bug class in this plugin."_

So a `git subtree split --prefix=plugins/ledger` today takes one `SKILL.md` and nine
reference documents and **leaves behind every gate that has ever caught a bug in them.**
Decision `vp-beads-cst` promises splitting back out is cheap; measured, it is a silent loss
of the repo's highest-value check. That is a far larger extraction hazard than the eslint
config `wsx` names, and until now nothing named it.

The split above resolves it without weakening either half: audits are **about** the plugin
system as a whole (they compare a manifest against a skill against a registry against a
`hooks.json`), so they are structurally root-shaped; lint/test/type are **about one
package's own source**, so they are structurally workspace-shaped. Extraction then carries
the second set and re-acquires the first from whatever repo the plugin lands in.

## Alternatives Considered

* **Keep the principle and make it true — duplicate the audits into each workspace.**
  Rejected: it copies the repo's highest-value checker four times, and four copies of an
  audit are four things that drift. It also defeats the audits' purpose, since several of
  them are _cross-plugin_ by nature (registry-vs-file, marketplace-vs-manifest).
* **Say nothing and keep fixing instances.** Rejected: `wsx` has been open naming only the
  eslint instance, and every fix filed under it reinforces a principle the bigger gate
  breaks. An unnamed contradiction is what makes each individual fix look correct.
* **Drop the audits from the root instead.** Rejected outright — they are the gates with a
  real catch history, which is exactly what the stopping rule says to keep.

## Execution

* Amend `CLAUDE.md` `## Validation` (**THE WORKSPACE OWNS ITS GATES** paragraph) to state the
  split, naming both classes, and stop asserting the universal form.
* Retract the root `eslint.config.js` `cliFiles` reach-in; add
  `plugins/diarie-adopt/eslint.config.js` pinned to the same `@voxpelli/eslint-config`
  version as the root (unpinned, the two drift — the risk the retraction exists to close).
* `vp-beads-wsx` narrows to the eslint retraction and can close with it.

## Affects

* **Supersedes the universal reading of _"THE WORKSPACE OWNS ITS GATES"_** in `CLAUDE.md`
  `## Validation`. The paragraph's warning about a workspace the root lints too remains
  correct — for lint. It was never true for audit.
* **`vp-beads-wsx`** — narrowed to the lint half, which is now the whole of it.
* **`vp-beads-gtd`** — confirmed rather than contradicted: plugin-discovery is the right
  shape for the audit gates, and this decision says so explicitly instead of leaving it
  implicit and in tension.
* **`vp-beads-cst`** — its "splitting back out is cheap" claim is now qualified: cheap for
  lint/test/type, and a re-acquisition cost for audit. Worth knowing before the split, not
  after.
