// The preset is re-exported as the CONFIG ITSELF, not listed under `plugins:` —
// that distinction is load-bearing and was measured, not assumed. Referencing it as
// `"plugins": ["@voxpelli/remark-preset"]` applies the preset's LINT RULES but
// SILENTLY DROPS its `settings`, so formatting falls back to remark's defaults
// (proof: a thematic break then serialized as `***`, byte-identical to `--no-config`,
// while the preset declares `rule: "-"`). A config that quietly stops carrying half
// the thing it names is this repo's signature failure mode, so consume the preset the
// one way that demonstrably applies both halves.
export { default } from '@voxpelli/remark-preset'
