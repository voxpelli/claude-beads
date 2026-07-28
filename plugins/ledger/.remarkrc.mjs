// Re-export the preset as the CONFIG ITSELF, never as a `plugins:` entry. Listing it
// under `plugins:` applies the preset's lint rules but SILENTLY DROPS its `settings`
// — measured: a thematic break then serializes as `***`, byte-identical to
// `--no-config`, while the preset declares `rule: "-"`. Half a config, quietly.
export { default } from '@voxpelli/remark-preset'
