---
id: vp-beads-dcl
title: Build the tracker as an in-repo npm workspace (`diarie`), ahead of v3's package staging
status: pending
type: decision
priority: medium
parent: vp-beads-l9i
updated: '2026-07-11'
---

## Decision

The flat-YAML tracker is a **`diarie` npm workspace** at `diarie/` — `cli.js` + `lib/`, a
`bin`, an `exports` map, five runtime dependencies — not the three loose `.mjs` helpers that
`DESIGN-tracker-exploration.md` (v3) and `ROADMAP.md` describe.

It is **in-repo, `private: true`, and unpublished.** The name gate stands: nothing exposes
the name `diarie` publicly (no push, no `npm publish`, no released plugin naming it) until
`diarie.dev` and a placeholder npm package are secured. Extraction, when it happens, is a
git-subtree split — not a rewrite.

This **is a delta from v3, and the delta is scope, not direction.** v3 said Option C is
*"in-repo `.mjs` helpers, **not** a separate package (lock-in resistance + platform
proximity)"*, and `ROADMAP.md` gates a package name at M3 and settles it at M4 —
`ROADMAP.md:19,223,234,336`, `DESIGN-tracker-exploration.md:50–53`. Those sentences are now
false about the code, and this record is what they point at rather than being quietly
deleted.

## Rationale

**Why now, and not at M3.**

- **The forcing function was other repos.** beads 1.1.0's migrate gate panics on every write,
  in every repo using the global binary — vp-knowledge and vp-git broke at the same moment
  vp-beads did. `/migrate-tracker` exists to serve them, and it cannot: three files that
  resolve their store from `import.meta.url` are copied into a target and then validate
  *nothing* from the wrong directory. A migrator other repos depend on needs one binary with
  a `--root` flag, which is a package.
- **The substrate earned it.** Option C was a bet when v3 was written. It has since survived
  a real 131-issue migration and a 24-issue live store, and the read/validate semantics have
  been dual-run against `bd ready` with every divergence explained. The doubt v3 was hedging
  against is resolved.
- **A tracker humans use needs a binary.** `node scripts/ready-walker.mjs --format json`
  versus `diarie ready --json` is not cosmetics; the former is a script you must know the
  layout of, and the latter is a tool. The two old readers did not even agree with each other
  on how to ask for JSON.
- **The package boundary is what made it *safe*.** This is the argument v3 could not have
  had, because the bug had not been found yet. The old readers resolved their store from
  `import.meta.url` — their own location on disk. That is invisible while the files sit in
  `scripts/`, and fatal once they sit in `node_modules/diarie/lib/`. Confronting the
  packaging question is what surfaced it, and fixing the store contract (`ENOSTORE`) is what
  made the relocation safe to attempt. Deferring the package would have deferred the fix.

**Why this is not a reversal of lock-in resistance.** v3's objection was to a *vendored
product* — a daemon, an MCP server, a database. `diarie` is a pure reader over committed
files, with no process, no index, and no service. The files stay canonical; every read is
derived; writes are still plain `Edit`/`Write` (there is no CRUD helper, deliberately —
substrate-not-opinion). Deleting the package would cost you a `bin`; it would not cost you
your data. That is the test lock-in resistance actually asks, and it passes.

**The honest cost.** Five runtime dependencies where there was one (`js-yaml`, `peowly`,
`peowly-commands`, `pony-cause`, `@voxpelli/typed-utils` — 25 transitive packages, 2.9 MB),
plus a dev toolchain that lands in every consumer's plugin cache. `markdown-or-chalk` was
declined precisely on this axis: it alone is 101 packages. `DESIGN-diarie-vs-beads.md`
carried a "one runtime dependency" boast and has been corrected rather than left standing.

## Alternatives Considered

- **Keep three loose `.mjs` files (v3 as written)** — declined. It cannot serve
  `/migrate-tracker`'s actual users, it forces the `import.meta.url` store-resolution bug to
  stay latent, and it leaves two readers disagreeing about their own flags.
- **Extract to a separate repo now** — declined, and this is the *timing* half of the
  decision. Extraction is a subtree split, which is cheap and reversible; publishing is not.
  Doing it in-repo keeps one `npm run check` over the tracker and the plugin that consumes
  it, and keeps the name gate closed. The workspace *is* the staging v3 asked for; it just
  arrived earlier than M3.
- **Wait for M3 (weft-ai adoption)** — declined. The trigger v3 chose was *external
  adoption*, but the pressure that actually arrived was *sibling migration*, which M3 does not
  model. Waiting for a signal that has not fired, while a signal that has fired goes unserved,
  is cargo-culting your own roadmap.

## Affects

- `DESIGN-tracker-exploration.md:50–53` and `ROADMAP.md:19,223,234,336` state Option C is not
  a package, and that M1 ships nothing on npm. Both now carry a pointer to this record.
  Their *milestones* survive: M3/M4 still gate **publishing** and the name, which is exactly
  what is still held.
- `DESIGN-diarie-vs-beads.md` — the "one runtime dependency (`js-yaml`)" claim and the
  "734 lines across three files" count are corrected. That document exists to avoid
  flattering claims; leaving them would have been the failure it was written to prevent.
- The store contract (`ENOSTORE`), the container rule (`vp-beads-epc`), and the `GlobalId`
  brand are all consequences of taking the package seriously — see CHANGELOG `Unreleased`.
- **Still gated:** `diarie.dev` + an npm placeholder before the name is public. `diarie/`
  stays `private: true`; the branch stays local.
