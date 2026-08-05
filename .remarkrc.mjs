// The shared preset IS the config.
//
// MEASURED 2026-07-22 — three consumption forms are EQUIVALENT. This re-export, a
// `.remarkrc` JSON carrying `{"plugins": ["@voxpelli/remark-preset"]}`, and a
// `remarkConfig` block in `package.json` all apply the preset's plugins AND its
// `settings` (probe: `---` kept per `rule: "-"`, `* a`, `_em_`; lint rules fire in
// every form). Pick whichever suits the file layout — nothing here depends on the
// choice.
//
// CORRECTION, recorded because the wrong version of this comment shipped first: an
// earlier draft claimed the `plugins:` form "silently drops the preset's settings".
// That was FALSE, and the mistake is worth naming — the experiment was CONFOUNDED.
// The probe file lived OUTSIDE the repo, so remark found no config at all and used
// its own defaults (`***`, `*em*`); the comparison run had the probe INSIDE the repo.
// Two variables moved at once (consumption form AND file location) and the effect was
// attributed to the wrong one. Config discovery walks up from the FILE being linted,
// never from cwd — so a probe outside the project silently tests nothing.
// TYPES: the preset ships none, so `tsc` reports TS7016 here (implicit `any`).
// MEASURED 2026-07-29 against `@voxpelli/remark-preset@0.1.1`: its package.json declares
// `"types": "index.d.ts"` and lists `index.d.ts` + `index.d.ts.map` in `files`, but the
// published tarball contains only `LICENSE`, `index.js`, `package.json` and `README.md`
// (`tar -tzf` on the registry tarball). The declarations are never emitted into the
// package — an upstream packaging defect, not a local misconfiguration. The upstream file
// for this dependency is `UPSTREAM-voxpelli--remark-preset.md`.
//
// A local `types/*.d.ts` shim is NOT an option here: this repo's tsconfig lists its
// program explicitly (`files` + `include: [scripts/**/*, eslint-local-rules/**/*]`) and
// sets no `typeRoots`, so a declaration file outside those paths is never loaded — and a
// hand-written shim would also silently outlive the upstream fix.
//
// `@ts-expect-error`, deliberately NOT `@ts-ignore`: it is self-cleaning. The day upstream
// publishes `index.d.ts`, this line becomes an unused-directive ERROR and the next `tsc`
// run tells us to delete it. That tripwire is the whole point.
// @ts-expect-error -- upstream package ships no declaration file; see the note above
export { default } from '@voxpelli/remark-preset'
