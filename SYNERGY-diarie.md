# SYNERGY-diarie

Tracking cross-project synergy with [diarie](https://github.com/voxpelli/diarie).

diarie is the flat-YAML tracker CLI extracted from this repo (2026-07-18, `git subtree split --rejoin`). This project consumes it: its skills shell out to the `diarie` binary and read the
`.diarie/` store. **Published 2026-07-18 and consumed as an ordinary npm dependency
(`diarie@^0.2.0` devDep; upstream is at 0.2.2) — the vendored `diarie/` workspace is GONE.**
Relationship: `dependency`.

> Staleness note (2026-07-22): this header previously read "`diarie/` is carried as a vendored
> subtree snapshot until diarie publishes". That premise expired when diarie published. The
> sibling's `SYNERGY-vp-beads.md` header carries the **same** stale claim and needs the same fix —
> a bilateral correction, not a one-sided one.

## Shared Patterns

* **The `.diarie/` store contract** (2026-07-18) — the store schema, the `--root` / nearest-wins
  resolution, and the `ENOSTORE` "missing store is an error, not an empty backlog" contract are owned
  by diarie (`diarie/lib/schema.js`) and consumed by this project's skills. They must stay aligned:
  a skill that reads the store must speak diarie's current CLI + codes.
  Status: aligned · Last verified: 2026-07-18
* **THE WORKSPACE OWNS ITS GATES; THE ROOT DELEGATES** (2026-07-18) — the npm-workspace
  gate-delegation pattern diarie's extraction proved (`npm run check --workspaces --if-present`; a
  workspace's own gates travel the subtree split) is the same pattern the vp-skills monorepo
  generalises to N plugin-workspaces. Keep the delegation shape aligned across both repos.
  Status: aligned · Last verified: 2026-07-18
* **remark `remarkConfig` markdown-lint config** (2026-07-22, reciprocating the sibling's entry) —
  the `remarkConfig` block (frontmatter + gfm + lint-recommended/consistent + validate-links +
  list-marker) was copied into diarie when it re-added `check:md` after the extraction — **but not
  verbatim, and the difference is material**: diarie's copy drops the `'-'` OPTION on
  `remark-lint-unordered-list-marker-style`, whose default is `'consistent'`, so diarie accepts any
  internally-consistent marker while this side pinned one. Measured: an all-`*` document was rejected
  here and accepted there before 2026-07-22 — and this repo's own preset adoption has since INVERTED
  that, so today it is an all-`-` document that is rejected here and accepted there.
  The sibling's entry predicted "two copies with no shared package will drift; converge on a shared
  package if a third consumer appears" — and **the count was already six, not two**: root
  `package.json` plus four byte-identical `plugins/*/.remarkrc` here, plus diarie's.
  **CONVERGED on this side 2026-07-22**: all five in-repo copies now re-export
  **`@voxpelli/remark-preset`**, and each plugin workspace declares it itself so the gate travels on
  extraction. diarie still carries its own inline copy — the remaining reciprocation gap, and the
  sibling's own call.
  Adoption note for the sibling: **all three consumption forms are equivalent** — a `plugins:`
  entry, a `.remarkrc` JSON, or a `package.json` `remarkConfig` block each apply the preset's
  plugins _and_ its `settings` (measured 2026-07-22). Adopting it changes the marker style
  (bullets `*`, emphasis `_`), which here meant a 51-file reformat; diarie should expect the same
  on its own tree. _(An earlier revision of this entry warned that the `plugins:` form drops
  settings — that was **FALSE**, from a confounded probe run outside the project where remark found
  no config at all. Retracted; noted so the sibling is not sent a phantom gotcha.)_
  Status: converged here, pending there · Last verified: 2026-07-22

## Divergences

* **`check:md` exclusion posture — deliberate, principled, and settled on both sides**
  (2026-07-22) — diarie runs ONE pass with **no per-file exclusions**
  (`remark . --quiet --frail --ignore-path .gitignore`), on the stated principle "**no unlinted
  island**" (decision `diarie-tbl`, which explicitly cites `vp-beads-imd` as the hazard it is
  avoiding); every decision `.md` and brand doc is linted there. This project instead excludes
  `.diarie/` from `check:md` and covers decision **bodies** with a separate `check:md-decisions`
  pass, additionally excluding `RESEARCH-*.md` and `.diarie/_archive/` as frozen provenance
  artifacts (`vp-beads-imd`, resolved 2026-07-22).
  **Both are correct for their role and this is NOT drift to converge:** diarie is the store's
  OWNER (its `.diarie/` is small, live, and entirely its own), while this repo carries frozen
  inherited artifacts (**297** warnings live in `.diarie/_archive/` + `RESEARCH-*.md`, 0 in live
  decision docs) that are deliberately not churned. _(That count was ~172 when first measured under
  the old inline config; adopting the preset added ~126 marker warnings to the same frozen files,
  which is exactly why they stay excluded rather than churned.)_ The shared conclusion both sides reached
  independently: the load-bearing gap is decision **frontmatter**, which neither remark config can
  see — tracked upstream as `diarie-dlm` (see `UPSTREAM-diarie.md`).
  Convergence status: accept-difference · Last verified: 2026-07-22

## Extraction Candidates

* **`diarie-adopt` co-location with diarie** (2026-07-18) — the bd→diarie adoption pair
  (migrate-tracker + deintegrate-beads) was routed to the vp-skills monorepo (`plugins/diarie-adopt`)
  to decouple it from diarie's publish timeline, overriding `DESIGN-constellation-repackaging.md` §4 /
  `vp-beads-ski` ("bd IS diarie's framing → ship with diarie"). If diarie publishes and wants to own
  its full adoption story, these could move to the diarie repo. Blocked on the cross-repo `bd-map`
  coupling (`diarie-adopt` needs `diarie/lib/migrate/bd-map.js` — see `handoffs/HANDOFF-diarie-publish.md`).
  Source: `plugins/diarie-adopt` (planned) · Readiness: needs-cleanup · Effort: moderate

## They Have / We Don't

_No entries yet._
