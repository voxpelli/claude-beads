## Feature Requests

* **`engines` is narrower than typical consumers declare** (2026-07-22,
  `@voxpelli/remark-preset@0.1.1`) — the preset requires
  `^22.22.2 || ^24.15.0 || >=26.0.0`, excluding Node 22.13–22.22.1 and 24.0–24.14. This repo
  declares `^22.13.0 || >=24.0.0`, which is broader; because the preset is a **dev**-only
  dependency and this repo runs no `installed-check`, the mismatch passes silently here (diarie,
  which does run `installed-check`, would go red). Not a defect in the preset — flagged because a
  dev-tool engines floor that outpaces its consumers' runtime floor is easy to adopt without
  noticing, and the consumer's own `engines` describes its RUNTIME support, which a dev tool should
  probably not force upward.
  Ownership: shared · Workaround: none needed today (dev-only; the local Node satisfies it).

_(A second entry was filed here on 2026-07-22 claiming that consuming the preset via
`"plugins": [...]` silently drops its `settings`. **That was FALSE and has been retracted** — the
experiment behind it was confounded: the probe file lived outside the project, so remark found no
config at all and fell back to its own defaults. Re-measured properly, all three consumption forms
— `plugins:` entry, `.remarkrc` JSON, and `package.json` `remarkConfig` — apply the preset's
plugins **and** its settings identically. Recorded here so the claim is not re-derived from the
git history.)_

## Bugs

_No entries yet._

## Upstream Opportunities

_No entries yet._
