// The shared preset IS the config. Three forms are equivalent (measured 2026-07-22):
// this re-export, a `.remarkrc` JSON with `{"plugins": ["@voxpelli/remark-preset"]}`,
// and a `remarkConfig` block in `package.json` — all apply the preset's plugins AND
// its `settings`. An earlier version of this comment claimed the `plugins:` form drops
// settings; that was FALSE (confounded experiment — see the root `.remarkrc.mjs`).
export { default } from '@voxpelli/remark-preset'
