## Feature Requests

* **Document the consumption pattern — listing the preset under `plugins:` silently drops its
  `settings`** (2026-07-22, `@voxpelli/remark-preset@0.1.1`) — the obvious-looking wiring
  `"remarkConfig": { "plugins": ["@voxpelli/remark-preset"] }` applies the preset's **lint rules**
  but **not** its `settings` block, so formatting silently falls back to remark's own defaults.
  MEASURED, three ways: through that config a thematic break serialized as `***` — byte-identical
  to `--no-config` — while the preset declares `rule: "-"`; emphasis stayed `*em*` though the
  preset declares `emphasis: "_"`; and `--setting 'rule:"-"'` on the same input produced `---`,
  proving the option itself works. Re-exporting the preset **as the config** instead
  (`.remarkrc.mjs` → `export { default } from '@voxpelli/remark-preset'`) applies both halves:
  `---`, `* a`, `_em_`.
  The failure mode is the dangerous kind — nothing errors, the lint rules genuinely run, and the
  gate stays green while quietly enforcing a different format than the one the preset names. A
  consumer that copies the README's install line into `package.json` gets half a preset and no
  signal. Request: state the `.remarkrc.mjs` re-export form in the README as **the** way to
  consume it (and, if `plugins:` placement is meant to work, either make settings propagate or
  warn when a preset with `settings` is used as a plugin entry).
  Ownership: upstream (`@voxpelli/remark-preset`) · Workaround: full — re-export as the config,
  which is what this repo now does in its root `.remarkrc.mjs` and in all four
  `plugins/*/.remarkrc.mjs`.

* **`engines` is narrower than typical consumers declare** (2026-07-22) — the preset requires
  `^22.22.2 || ^24.15.0 || >=26.0.0`, excluding Node 22.13–22.22.1 and 24.0–24.14. This repo
  declares `^22.13.0 || >=24.0.0`, which is broader; because it is a **dev**-only dependency and
  this repo runs no `installed-check`, the mismatch passes silently here (diarie, which does run
  `installed-check`, would go red). Not a defect in the preset — flagged because a dev-tool
  engines floor that outpaces its consumers' runtime floor is easy to adopt without noticing.
  Ownership: shared · Workaround: none needed today (dev-only; the local Node satisfies it).

## Bugs

_No entries yet._

## Upstream Opportunities

_No entries yet._
