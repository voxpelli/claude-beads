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
export { default } from '@voxpelli/remark-preset'
