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

* **Declares `types` and lists declarations in `files`, but the published tarball ships none**
  (2026-07-29, `@voxpelli/remark-preset@0.1.1`) \[degraded] — `package.json` sets
  `"types": "index.d.ts"` and `"files": ["index.js", "index.d.ts", "index.d.ts.map"]`, yet
  `tar -tzf` on the registry tarball yields only `package/LICENSE`, `package/index.js`,
  `package/package.json`, `package/README.md`. The installed `node_modules` copy matches, so the
  declarations are never emitted into the package — a build/publish step that does not run, not a
  consumer misconfiguration. Consumer impact: any `tsc` run over a file importing the preset gets
  **TS7016** (implicitly `any`), which is what blocked arming `check:tsc` here.
  Severity: degraded · Ownership: upstream · Workaround: partial — a scoped `@ts-expect-error` on
  the import in `.remarkrc.mjs`. Deliberately `@ts-expect-error` and NOT `@ts-ignore`, because it is
  self-cleaning: the day this ships declarations the directive becomes an unused-directive ERROR and
  `tsc` tells us to delete it. Verified that tripwire fires by writing a minimal `index.d.ts` into
  the installed package and re-running `tsc` — `TS2578: Unused '@ts-expect-error' directive`. A local
  `types/*.d.ts` shim was rejected as the alternative: this repo's tsconfig lists its program
  explicitly with no `typeRoots`, so the shim would never load — and it would silently outlive the
  upstream fix.

## Upstream Opportunities

_No entries yet._
