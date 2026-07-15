/**
 * `check:ast-grep` with a coverage FLOOR (vp-beads-flr).
 *
 * diarie's ast-grep check is a bare `ast-grep scan` — no path list — deliberately, so a rule can
 * never be scoped outside a path list the runner forgot to update. But a bare scan is bounded by
 * `.gitignore` (ast-grep honours it as ripgrep does), so ONE broad ignore line — `lib/generated/`,
 * `dist/`, a stray `lib/**` — silently shrinks lint coverage with nothing going red. The bound is
 * moved, not removed: from a path list a runner can check to a git file nobody checks. A reviewer
 * proved it by appending one line and watching the scan go blind (2026-07-14).
 *
 * So don't trust "the scan ran"; assert HOW MUCH it saw. This wraps the same bare scan and reads
 * `scannedFileCount` straight off `--inspect entity`'s stderr summary — ASK ast-grep, don't model
 * it (no second file-set to drift) — and fails if it drops below the floor.
 *
 * THE FLOOR. The scan sees 30 files today (21 lib + 6 test + 2 root + this script). The floor is
 * set below that with a small margin: a broad ignore trips it hard (`lib/**` → 9, `test/**` → 24,
 * both < 25), while a few files of legitimate churn do not. A SURPRISING drop below the floor is the signal —
 * so when the package genuinely grows or shrinks past it, bump this number DELIBERATELY, the same
 * way you would a coverage threshold. That deliberate edit is the whole point.
 *
 * Only literal exit codes here: diarie's own `no-computed-exit-code` rule scans this file (the bare
 * scan walks the whole package), so a real violation is collapsed to a plain `exit(1)`, never a
 * propagated `exit(r.status)`.
 */

import { spawnSync } from 'node:child_process'
import process from 'node:process'

const FLOOR = 25

// `--inspect entity` runs the full scan exactly as before (violations on stdout, exit non-zero on
// an error) AND prints a per-run summary to stderr. One invocation does both jobs.
const result = spawnSync('ast-grep', ['scan', '--inspect', 'entity'], { encoding: 'utf8' })

process.stdout.write(result.stdout ?? '')
process.stderr.write(result.stderr ?? '')

// A spawn failure (ast-grep not on PATH, etc.) leaves status=null and stderr=null — surface the cause
// instead of a bare exit-1 with no message. The comment below already anticipated this case.
if (result.error) {
  process.stderr.write(`check:ast-grep floor: could not run ast-grep — ${result.error.message}\n`)
  process.exit(1)
}

// A real lint violation (or ast-grep itself failing to run) fails regardless of the floor.
if (result.status !== 0) {
  process.exit(1)
}

const match = /scannedFileCount=(\d+)/.exec(result.stderr ?? '')
if (!match) {
  process.stderr.write('check:ast-grep floor: could not read scannedFileCount from --inspect output — did the summary format change?\n')
  process.exit(1)
}

const scanned = Number(match[1])
if (scanned < FLOOR) {
  process.stderr.write(
    `check:ast-grep floor: only ${scanned} file(s) scanned, floor is ${FLOOR}. A broad .gitignore line ` +
    'likely blinded the bare scan (ast-grep honours .gitignore). See vp-beads-flr.\n'
  )
  process.exit(1)
}
