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

const inCi = Boolean(process.env.GITHUB_ACTIONS)
const formatArgs = inCi ? ['--format', 'github'] : []

// THE PLUGIN'S OWN TREE, AND NOTHING ELSE. `diarie/` is gone from this list: the workspace now
// carries its own `sgconfig.yml` + `.ast-grep/` and runs them itself (`npm run check
// --workspace=diarie`), so scanning it from here would lint it twice under two rule sets that can
// drift — and would keep the extracted package's guards living in a repo it is about to leave.
//
// Note what diarie's config does NOT have: a path list. `ast-grep scan` with no path arguments
// walks the whole project, so over there a rule cannot be scoped outside what is scanned. This
// runner needs a list only because it lints a SUBSET of a larger repo — and that list is exactly
// what the guard below exists to police.
const PATHS = ['scripts/', 'validate-plugin.mjs']

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
    'Fix the path list in scripts/check-ast-grep.mjs (and keep `fix:ast-grep` in package.json in step).'
  )
  process.exit(1)
}

const result = spawnSync('ast-grep', ['scan', ...formatArgs, ...PATHS], { stdio: 'inherit' })

process.exit(result.status ?? 1)
