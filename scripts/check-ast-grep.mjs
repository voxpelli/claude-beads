// Runs the `.ast-grep/rules/` structural lint suite over the .mjs tooling.
// Adopted from vp-claude (SYNERGY-vp-knowledge.md) — same layout, same runner.
//
// In CI, ast-grep's native `--format github` emits `::error`/`::warning`
// workflow-command annotations directly, matching the CI visibility
// validate-plugin.mjs already gives its own warn()/error() calls. Locally, the
// default rich diagnostic view (source preview) is kept.
//
// Rules carry their own `files:`/`ignores:` scoping, so the paths passed here
// are the outer bound, not the filter.

import { spawnSync } from 'node:child_process'

const inCi = Boolean(process.env.GITHUB_ACTIONS)
const formatArgs = inCi ? ['--format', 'github'] : []

// `diarie/test/` is in the outer bound because a rule scoped to a directory nobody scans
// is a rule that is green and inert. `no-identical-test-title` lives there, and
// `check:ast-grep-test` cannot cover for it: `ast-grep test` only replays a rule against
// its own snapshot fixtures — it never walks the tree.
const result = spawnSync(
  'ast-grep',
  ['scan', ...formatArgs, 'scripts/', 'diarie/lib/', 'diarie/test/', 'validate-plugin.mjs'],
  { stdio: 'inherit' }
)

process.exit(result.status ?? 1)
