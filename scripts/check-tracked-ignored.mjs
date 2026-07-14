// No TRACKED file may match .gitignore.
//
// A file that git tracks but .gitignore matches is a file that ships, is reviewed, and is invisible to
// every tool that takes `.gitignore` as its bound. That is most of them: `remark --ignore-path
// .gitignore` (our `check:md`), `ast-grep scan` (the `ignore` crate, same as ripgrep), `eslint`, `rg`.
// The file is in the repo and in the release, and no gate has ever looked at it.
//
// THIS GUARD WAS BORN RED, which is the only reason to trust it. On the day it was written it found:
//
//   skills/swarm-wave/references/agent-concurrency-limits.md
//
// — a TRACKED, SHIPPED plugin document, listed in CLAUDE.md's own layout tree, swallowed by the
// unanchored `AGENT-*.md` on line 4 of `.gitignore` (intended for root-level scratch files like
// `AGENT-03.md`; it matches at ANY depth, and `core.ignorecase=true` on macOS makes it match
// `agent-concurrency-limits.md` too). `check:md` runs remark with `--frail`, so warnings are errors —
// and that file has warnings. **`check:md` had been green over a file that would fail it, for as long
// as the file has existed.** A gate, running, reporting success, inspecting nothing.
//
// WHY `--no-index` IS THE WHOLE TRICK. `git check-ignore` **does not report tracked paths** by default
// — it consults the index and stays silent, which is precisely the case we are hunting. Only
// `--no-index` asks the question we mean: *does .gitignore match this path, never mind that git already
// tracks it.* Measured both ways; the default reports nothing.
//
// This needs no fixtures and no harness. It is a question with one right answer — the empty set — and
// it goes red the moment that stops being true. A guard that can be proved by running it once, on the
// real repo, is worth more than one that needs a sandbox to demonstrate it works.

import { spawnSync } from 'node:child_process'
import process from 'node:process'

const tracked = spawnSync('git', ['ls-files', '-c', '-z'], { encoding: 'utf8' })
if (tracked.status !== 0) {
  console.error(`check-tracked-ignored: \`git ls-files\` failed: ${tracked.stderr}`)
  process.exit(1)
}

// `check-ignore` exits 1 when NOTHING matches — which is the healthy case here. So a non-zero status is
// not an error, and only a genuine failure (status 128) is.
const ignored = spawnSync('git', ['check-ignore', '--no-index', '--stdin', '-z'], {
  input: tracked.stdout,
  encoding: 'utf8',
})
if (ignored.status !== 0 && ignored.status !== 1) {
  console.error(`check-tracked-ignored: \`git check-ignore\` failed: ${ignored.stderr}`)
  process.exit(1)
}

const offenders = ignored.stdout.split('\0').filter(Boolean)

if (offenders.length) {
  console.error(
    `check-tracked-ignored: ${offenders.length} TRACKED file(s) are matched by .gitignore:\n\n` +
    offenders.map(f => `  - ${f}`).join('\n') + '\n\n' +
    'Each one ships and is reviewed, yet is INVISIBLE to every tool bounded by .gitignore —\n' +
    '`check:md` (remark --ignore-path .gitignore), `ast-grep scan`, ripgrep. The gate is green\n' +
    'because it never looked.\n\n' +
    'Fix the .gitignore pattern (an unanchored `FOO-*.md` matches at ANY depth, and matching is\n' +
    'case-insensitive on macOS), or stop tracking the file. Do not add an exception here.'
  )
  process.exit(1)
}

console.log(`check-tracked-ignored: ${tracked.stdout.split('\0').filter(Boolean).length} tracked files, none matched by .gitignore`)
