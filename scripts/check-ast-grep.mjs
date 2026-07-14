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
import { existsSync } from 'node:fs'
import process from 'node:process'

const inCi = Boolean(process.env.GITHUB_ACTIONS)
const formatArgs = inCi ? ['--format', 'github'] : []

// `fix:ast-grep` is THIS script with `--update-all`, not a second `ast-grep scan` invocation with a
// hand-copied path list. It used to be the latter, under a comment in this very file instructing
// that the two be "kept in step" — and they drifted apart in the same commit that added `hooks/`, so
// the fixer silently stopped rewriting the one directory the newest rule was aimed at. A "keep these
// in step" comment is a manual invariant with no gate behind it. The list has one home now.
const updateAll = process.argv.includes('--update-all')

import { PATHS } from './ast-grep-paths.mjs'

// THE GUARD NEEDS A GUARD. `ast-grep scan` on a path that does not exist prints
// `ERROR: <path>: No such file or directory` to stderr — and EXITS 0. Since this script
// forwards ast-grep's status, a renamed or moved directory would silently shrink the scan to
// nothing and the check would stay green: a green check over work not done, in the very tool
// that exists to prevent it. So the paths are verified here, before ast-grep is trusted with
// them. Do not remove this: the failure it prevents leaves no trace.
const missing = PATHS.filter(p => !existsSync(p))

if (missing.length) {
  console.error(
    `check-ast-grep: ${missing.length} scan path(s) do not exist: ${missing.join(', ')}\n` +
    'ast-grep exits 0 on a missing path, so this would otherwise pass while scanning nothing.\n' +
    'Fix the path list in scripts/ast-grep-paths.mjs — it is the single home for it.'
  )
  process.exit(1)
}

const result = spawnSync(
  'ast-grep',
  ['scan', ...(updateAll ? ['--update-all'] : formatArgs), ...PATHS],
  { stdio: 'inherit' }
)

process.exit(result.status ?? 1)
